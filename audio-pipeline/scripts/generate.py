"""Generates candidate takes with Chatterbox Multilingual, one per (character, line, variant).

Examples:
    python scripts/generate.py --phase A                         # "SEIS, LADRÃO!" × 6 voices × 3
    python scripts/generate.py --phase B                         # 5 lines × 5 styles × 6 voices
    python scripts/generate.py --character tiao
    python scripts/generate.py --character jessica --category truco
    python scripts/generate.py --line six_001 --variants 5
    python scripts/generate.py --all
    python scripts/generate.py --phase A --builtin               # model's built-in voice (testing)
    python scripts/generate.py --character ze --line truco_004 --variant 2 --force   # regenerates one

Resumes where it stopped: a take whose WAV and JSON already exist with the same parameters is
skipped. --force regenerates anyway. --dry-run only lists what it would do.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import sys
import time
from pathlib import Path

# The sampler's tqdm bar clutters the log of every take.
os.environ.setdefault("TQDM_DISABLE", "1")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import (  # noqa: E402
    CANDIDATES, MODELS, OUTPUT, ROOT, characters, generation, load_lines, params_for, rel,
    seed_for, spoken_text, take_name,
)

BASE_REPO = "ResembleAI/chatterbox"
PACKS = {
    # file in the model directory -> (repository, file in the repository)
    "pt-br": {
        "ve.pt": (BASE_REPO, "ve.pt"),
        "conds.pt": (BASE_REPO, "conds.pt"),
        "Cangjie5_TC.json": (BASE_REPO, "Cangjie5_TC.json"),
        "t3.safetensors": ("ResembleAI/Chatterbox-Multilingual-pt-br", "t3_pt_br.safetensors"),
        "s3gen.pt": ("ResembleAI/Chatterbox-Multilingual-pt-br", "s3gen_v3.pt"),
        "grapheme_mtl_merged_expanded_v1.json": (
            "ResembleAI/Chatterbox-Multilingual-pt-br", "grapheme_mtl_merged_expanded_v1.json"),
    },
    "v3": {
        "ve.pt": (BASE_REPO, "ve.pt"),
        "conds.pt": (BASE_REPO, "conds.pt"),
        "Cangjie5_TC.json": (BASE_REPO, "Cangjie5_TC.json"),
        "t3.safetensors": (BASE_REPO, "t3_mtl23ls_v3.safetensors"),
        "s3gen.pt": (BASE_REPO, "s3gen_v3.pt"),
        "grapheme_mtl_merged_expanded_v1.json": (BASE_REPO, "grapheme_mtl_merged_expanded_v1.json"),
    },
}
# The library was generated while line ids were still Portuguese (seis_001, ...), and the seed is
# derived from the line id. Seeding with the original id keeps existing takes reproducible and
# stops a rename from regenerating the whole library.
SEED_LINE_PREFIX = {
    "six": "seis", "nine": "nove", "twelve": "doze", "taunt": "provocacao", "win": "vitoria", "loss": "derrota",
}


def seed_line_id(line_id: str) -> str:
    category, _, number = line_id.rpartition("_")
    return f"{SEED_LINE_PREFIX.get(category, category)}_{number}"


BUILTIN = {"builtin": {"name": "Model built-in voice", "gender": "?", "params": {}}}


def model_dir(variant: str) -> Path:
    """Builds models/<variant>/ with links into the Hugging Face cache, in the from_local layout."""
    from huggingface_hub import hf_hub_download

    target = MODELS / variant
    target.mkdir(parents=True, exist_ok=True)
    for name, (repo, filename) in PACKS[variant].items():
        link = target / name
        if not link.exists():
            source = hf_hub_download(repo, filename)
            if link.is_symlink():
                link.unlink()
            link.symlink_to(source)
    return target


def load_model(variant: str, device: str):
    """The package's from_local, with one difference: s3gen_v3.pt lacks the tokenizer's fixed
    buffers (mel filters and window), which S3Gen already creates in __init__. The official Space
    of the pt-br pack loads with strict=False for the same reason; here only those two may be missing."""
    import torch
    from chatterbox.models.s3gen import S3Gen
    from chatterbox.models.t3 import T3
    from chatterbox.models.t3.modules.t3_config import T3Config
    from chatterbox.models.tokenizers import MTLTokenizer
    from chatterbox.models.voice_encoder import VoiceEncoder
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals
    from safetensors.torch import load_file

    ckpt = model_dir(variant)
    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(ckpt / "ve.pt", map_location="cpu", weights_only=True))
    ve.to(device).eval()

    t3 = T3(T3Config.multilingual())
    state = load_file(ckpt / "t3.safetensors")
    t3.load_state_dict(state["model"][0] if "model" in state else state)
    t3.to(device).eval()

    s3gen = S3Gen()
    result = s3gen.load_state_dict(
        torch.load(ckpt / "s3gen.pt", map_location="cpu", weights_only=True), strict=False)
    unexpected_missing = set(result.missing_keys) - {"tokenizer._mel_filters", "tokenizer.window"}
    if unexpected_missing or result.unexpected_keys:
        raise RuntimeError(f"incompatible s3gen: missing {unexpected_missing}, unexpected {result.unexpected_keys}")
    s3gen.to(device).eval()

    tokenizer = MTLTokenizer(str(ckpt / "grapheme_mtl_merged_expanded_v1.json"))
    conds = Conditionals.load(ckpt / "conds.pt", map_location="cpu").to(device)
    return ChatterboxMultilingualTTS(t3, s3gen, ve, tokenizer, device, conds=conds)


def set_seed(seed: int) -> None:
    import numpy as np
    import torch

    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def jobs(args, gen: dict, lines: dict, cast: dict) -> list[dict]:
    by_id = {line["id"]: line for line in lines["lines"]}
    phase = gen["phases"].get(args.phase) if args.phase else None
    line_ids = args.line or (phase["lines"] if phase else [l["id"] for l in lines["lines"]])
    unknown = [i for i in line_ids if i not in by_id]
    if unknown:
        raise SystemExit(f"unknown lines: {unknown}")
    selected = [by_id[i] for i in line_ids if not args.category or by_id[i]["category"] in args.category]
    styles = args.style or (phase.get("styles") if phase else None) or [None]
    variants = [args.variant] if args.variant else range(1, (args.variants or gen["variants"]) + 1)
    if args.phase == "B" and not args.variants and not args.variant:
        variants = [1]

    root = OUTPUT / "smoke" if args.builtin else OUTPUT / "phase_b" if args.phase == "B" else CANDIDATES
    out = []
    for char_id, character in cast.items():
        for line in selected:
            for style in styles:
                for variant in variants:
                    params = params_for(character, line, gen, style)
                    seed = seed_for(gen["base_seed"], char_id, seed_line_id(line["id"]), style or "", variant)
                    folder = root / char_id / (style or line["category"])
                    out.append({
                        "character": char_id,
                        "line": line,
                        "style": style,
                        "variant": variant,
                        "params": params,
                        "seed": seed,
                        "text": spoken_text(character, line, lines),
                        "reference": None if args.builtin else character["reference"],
                        "wav": folder / f"{take_name(line, variant)}.wav",
                    })
    return out


def fingerprint(job: dict, model: str) -> str:
    ref = job["reference"]
    ref_hash = hashlib.sha256((ROOT / ref).read_bytes()).hexdigest()[:16] if ref else "builtin"
    key = json.dumps([model, job["text"], job["params"], job["seed"], ref_hash], sort_keys=True)
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--phase", choices=["A", "B"], help="proof of concept: A (voices) or B (deliveries)")
    parser.add_argument("--all", action="store_true", help="every line for every character")
    parser.add_argument("--character", action="append", help="character id (repeatable)")
    parser.add_argument("--category", action="append", help="category (repeatable)")
    parser.add_argument("--line", action="append", help="line id, e.g. six_001 (repeatable)")
    parser.add_argument("--style", action="append", help="phase B style (repeatable)")
    parser.add_argument("--variants", type=int, help="how many variants per line")
    parser.add_argument("--variant", type=int, help="generate only this variant")
    parser.add_argument("--model", choices=sorted(PACKS), help="overrides model.variant from generation.yaml")
    parser.add_argument("--builtin", action="store_true",
                        help="use the model's built-in voice instead of the references (pipeline testing only)")
    parser.add_argument("--force", action="store_true", help="regenerate takes that already exist")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not (args.phase or args.all or args.character or args.category or args.line):
        parser.error("say what to generate: --phase, --all, --character, --category or --line")

    gen = generation()
    lines = load_lines()
    model_variant = args.model or gen["model"]["variant"]
    cast = BUILTIN if args.builtin else characters()
    if args.character and not args.builtin:
        missing = [c for c in args.character if c not in cast]
        if missing:
            raise SystemExit(f"unknown characters: {missing}")
        cast = {c: cast[c] for c in args.character}

    if not args.builtin:
        absent = [c for c, ch in cast.items() if not (ROOT / ch["reference"]).is_file()]
        if absent:
            print("Missing reference recordings (see references/README.md):", file=sys.stderr)
            for c in absent:
                print(f"  {cast[c]['reference']}", file=sys.stderr)
            print("To test the pipeline without them, use --builtin.", file=sys.stderr)
            return 2
        unauthorized = [c for c, ch in cast.items() if not str(ch.get("consent") or "").strip()]
        if unauthorized:
            print("Reference without recorded consent (consent field in config/characters.yaml):",
                  ", ".join(unauthorized), file=sys.stderr)
            return 2

    todo = []
    for job in jobs(args, gen, lines, cast):
        job["fingerprint"] = fingerprint(job, model_variant)
        meta = job["wav"].with_suffix(".json")
        if not args.force and job["wav"].exists() and meta.exists():
            if json.loads(meta.read_text()).get("fingerprint") == job["fingerprint"]:
                continue
        todo.append(job)
    print(f"{len(todo)} takes to generate (model {model_variant})")
    if args.dry_run:
        for job in todo:
            print(f"  {rel(job['wav'])}  {job['params']}")
        return 0
    if not todo:
        return 0

    import soundfile as sf
    import torch

    device = gen["model"]["device"] if torch.cuda.is_available() else "cpu"
    started = time.time()
    model = load_model(model_variant, device)
    print(f"model loaded in {time.time() - started:.0f}s ({device})")

    current_ref = None
    started = time.time()
    for n, job in enumerate(todo, 1):
        p = job["params"]
        # The reference is processed once per character; generate only adjusts exaggeration.
        ref_key = (job["character"], job["reference"])
        if job["reference"] and ref_key != current_ref:
            model.prepare_conditionals(str(ROOT / job["reference"]), exaggeration=p["exaggeration"])
            current_ref = ref_key
        set_seed(job["seed"])
        t0 = time.time()
        wav = model.generate(
            job["text"], gen["model"]["language_id"],
            exaggeration=p["exaggeration"], cfg_weight=p["cfg_weight"], temperature=p["temperature"],
            repetition_penalty=p["repetition_penalty"], min_p=p["min_p"], top_p=p["top_p"],
        )
        audio = wav.squeeze(0).numpy()
        duration = len(audio) / model.sr
        job["wav"].parent.mkdir(parents=True, exist_ok=True)
        tmp = job["wav"].with_suffix(".tmp.wav")
        sf.write(tmp, audio, model.sr, subtype="PCM_16")
        os.replace(tmp, job["wav"])
        warnings = []
        # A short truco line stays under ~5 s; much longer usually means a hallucination.
        if duration > max(4.0, len(job["text"]) * 0.16):
            warnings.append("too long for the text, listen carefully")
        meta = {
            "character": job["character"],
            "line_id": job["line"]["id"],
            "category": job["line"]["category"],
            "text": job["line"]["text"],
            "spoken_text": job["text"],
            "style": job["style"],
            "variant": job["variant"],
            "model": f"chatterbox-multilingual/{model_variant}",
            "language_id": gen["model"]["language_id"],
            "reference": job["reference"] or "builtin:conds.pt",
            "params": p,
            "seed": job["seed"],
            "sample_rate": model.sr,
            "duration_s": round(duration, 3),
            "generation_s": round(time.time() - t0, 2),
            "fingerprint": job["fingerprint"],
            "warnings": warnings,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }
        job["wav"].with_suffix(".json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
        eta = (time.time() - started) / n * (len(todo) - n)
        flag = f"  ⚠ {warnings[0]}" if warnings else ""
        print(f"[{n}/{len(todo)}] {rel(job['wav'])}  {duration:.1f}s in {meta['generation_s']}s  "
              f"(~{eta / 60:.0f} min left){flag}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
