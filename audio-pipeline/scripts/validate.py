"""Validação automática dos áudios. Não substitui ouvir: só pega defeito objetivo.

Checa integridade (decodifica inteiro), duração, silêncio nas pontas, clipping, formato,
duplicatas e, para output/final, a correspondência com o manifesto.
Com --asr, transcreve com Whisper local e mede a distância para o texto (pega palavra trocada,
engolida ou alucinada) e grava o resultado no JSON de cada tomada, onde a revisão mostra.

    python scripts/validate.py                       # candidatas
    python scripts/validate.py --asr                 # + transcrição
    python scripts/validate.py --stage selected
    python scripts/validate.py --stage final         # + manifesto
    python scripts/validate.py --path output/smoke --asr
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CANDIDATES, FINAL, MANIFEST_FILE, ROOT, SELECTED, ffprobe, generation, rel  # noqa: E402

STAGES = {"candidates": CANDIDATES, "selected": SELECTED, "final": FINAL}
EXPECTED_CODEC = {".wav": "pcm_s16le", ".ogg": "opus", ".mp3": "mp3"}
ASR_MODEL = "openai/whisper-large-v3-turbo"


def decode(path: Path) -> tuple[np.ndarray, int]:
    """Decodifica inteiro via FFmpeg (também prova que o arquivo não está truncado)."""
    sr = 48000
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
        capture_output=True,
    )
    if out.returncode != 0 or out.stderr.strip():
        raise RuntimeError(out.stderr.decode().strip() or "falha ao decodificar")
    return np.frombuffer(out.stdout, dtype=np.float32), sr


def edge_silence(audio: np.ndarray, sr: int, threshold_db: float) -> tuple[float, float]:
    frame = int(sr * 0.01)
    n = len(audio) // frame
    if n == 0:
        return 0.0, 0.0
    rms = np.sqrt(np.mean(audio[: n * frame].reshape(n, frame) ** 2, axis=1) + 1e-12)
    loud = np.where(20 * np.log10(rms) > threshold_db)[0]
    if len(loud) == 0:
        return n * 0.01, n * 0.01
    return loud[0] * 0.01, (n - 1 - loud[-1]) * 0.01


def normalize_words(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    text = re.sub(r"(.)\1{2,}", r"\1", text)  # TRUUUUUCO, SEEEEEIS, CHUPAAAA
    # O Whisper escreve "6" por "seis" e corrige "cê" para "você"; nada disso é erro de fala.
    return " ".join(SPOKEN.get(w, w) for w in re.findall(r"[a-z0-9]+", text))


SPOKEN = {"3": "tres", "6": "seis", "9": "nove", "12": "doze", "voce": "ce"}


def cer(ref: str, hyp: str) -> float:
    a, b = normalize_words(ref).replace(" ", ""), normalize_words(hyp).replace(" ", "")
    if not a:
        return 0.0 if not b else 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1] / len(a)


def check_file(path: Path, cfg: dict, processed: bool) -> tuple[dict, list[str], list[str]]:
    errors, warnings = [], []
    info: dict = {"path": rel(path)}
    try:
        probe = ffprobe(path)
        stream = probe["streams"][0]
        info["codec"] = stream["codec_name"]
        info["sample_rate"] = int(stream["sample_rate"])
        info["channels"] = stream["channels"]
        if info["codec"] != EXPECTED_CODEC.get(path.suffix):
            errors.append(f"codec {info['codec']}, esperado {EXPECTED_CODEC.get(path.suffix)}")
        if info["channels"] != 1:
            warnings.append(f"{info['channels']} canais, esperado mono")
        audio, sr = decode(path)
    except Exception as exc:  # noqa: BLE001
        return info, [f"corrompido: {exc}"], warnings

    duration = len(audio) / sr
    info["duration_s"] = round(duration, 3)
    info["sha"] = hashlib.sha256(np.round(audio, 3).tobytes()).hexdigest()[:16]
    if duration < cfg["min_duration_s"]:
        errors.append(f"curto demais ({duration:.2f}s)")
    if duration > cfg["max_duration_s"]:
        errors.append(f"longo demais ({duration:.2f}s), provável alucinação")
    lead, tail = edge_silence(audio, sr, -45)
    info["edge_silence_s"] = [round(lead, 2), round(tail, 2)]
    limit = cfg["max_edge_silence_s"]
    if max(lead, tail) > limit:
        (errors if processed else warnings).append(f"silêncio nas pontas {lead:.2f}s/{tail:.2f}s")
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    clipped = float(np.mean(np.abs(audio) >= 0.999)) if len(audio) else 0.0
    info["peak_dbfs"] = round(20 * np.log10(peak + 1e-12), 2)
    info["clip_ratio"] = round(clipped, 5)
    if clipped > cfg["clip_ratio"]:
        (errors if processed else warnings).append(f"clipping em {clipped:.2%} das amostras")
    if np.sqrt(np.mean(audio**2)) < 1e-3:
        errors.append("praticamente mudo")
    return info, errors, warnings


def run_asr(paths: list[Path]) -> dict[Path, str]:
    import torch
    from transformers import pipeline

    asr = pipeline("automatic-speech-recognition", model=ASR_MODEL, torch_dtype=torch.float16,
                   device=0 if torch.cuda.is_available() else -1)
    out = {}
    for path in paths:
        audio, sr = decode(path)
        resampled = audio[:: sr // 16000] if sr % 16000 == 0 else audio
        result = asr({"raw": resampled, "sampling_rate": 16000},
                     generate_kwargs={"language": "portuguese", "task": "transcribe"})
        out[path] = result["text"].strip()
    return out


def check_manifest(files: list[Path]) -> list[str]:
    if not MANIFEST_FILE.exists():
        return ["manifesto ausente: rode scripts/export.py"]
    manifest = json.loads(MANIFEST_FILE.read_text())
    errors, listed = [], set()
    char_ids = {c["id"] for c in manifest["characters"]}
    for line in manifest["lines"]:
        for char_id, takes in line["voices"].items():
            if char_id not in char_ids:
                errors.append(f"{line['id']}: personagem {char_id} fora da lista")
            for take in takes:
                for fmt in ("ogg", "mp3"):
                    path = FINAL / take[fmt]
                    listed.add(path.resolve())
                    if not path.exists():
                        errors.append(f"{line['id']}/{char_id}: {take[fmt]} não existe")
                    elif path.stat().st_size != take[f"{fmt}_bytes"]:
                        errors.append(f"{take[fmt]}: tamanho difere do manifesto")
    for path in files:
        if path.resolve() not in listed:
            errors.append(f"{rel(path)} não está no manifesto")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stage", choices=sorted(STAGES), default="candidates")
    parser.add_argument("--path", type=Path, help="pasta específica (sobrescreve --stage)")
    parser.add_argument("--asr", action="store_true", help=f"transcreve com {ASR_MODEL} (local)")
    parser.add_argument("--report", type=Path, help="grava o relatório completo em JSON")
    args = parser.parse_args()

    cfg = generation()["validation"]
    root = (ROOT / args.path).resolve() if args.path else STAGES[args.stage]
    processed = args.stage in ("selected", "final") or "selected" in root.parts
    files = sorted(p for p in root.rglob("*") if p.suffix in EXPECTED_CODEC and ".tmp." not in p.name)
    if not files:
        print(f"nenhum áudio em {rel(root)}")
        return 0

    report, failed, seen = [], 0, {}
    for path in files:
        info, errors, warnings = check_file(path, cfg, processed)
        if "sha" in info:
            # O mesmo áudio em formatos diferentes é esperado; repetido no mesmo formato, não.
            key = (info["sha"], path.suffix)
            if key in seen:
                errors.append(f"duplicado de {seen[key]}")
            seen[key] = info["path"]
        info["errors"], info["warnings"] = errors, warnings
        report.append(info)

    if args.asr:
        wavs = [p for p in files if p.suffix == ".wav"]
        print(f"transcrevendo {len(wavs)} tomadas...", flush=True)
        for path, heard in run_asr(wavs).items():
            meta_path = path.with_suffix(".json")
            meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
            text = meta.get("spoken_text") or meta.get("text")
            entry = next(r for r in report if r["path"] == rel(path))
            entry["asr"] = heard
            if text:
                entry["cer"] = round(cer(text, heard), 3)
                if entry["cer"] > 0.25:
                    entry["warnings"].append(f"transcrição diverge ({entry['cer']:.0%}): \"{heard}\"")
                meta["asr"] = {"model": ASR_MODEL, "text": heard, "cer": entry["cer"]}
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    manifest_errors = check_manifest(files) if root == FINAL else []

    for entry in report:
        if entry["errors"] or entry["warnings"]:
            mark = "✗" if entry["errors"] else "!"
            failed += bool(entry["errors"])
            print(f"{mark} {entry['path']}: {'; '.join(entry['errors'] + entry['warnings'])}")
    for error in manifest_errors:
        print(f"✗ manifesto: {error}")
    durations = [r["duration_s"] for r in report if "duration_s" in r]
    print(f"\n{len(report)} arquivos, {failed} com erro, "
          f"{sum(bool(r['warnings']) and not r['errors'] for r in report)} com aviso; "
          f"duração {min(durations):.2f}-{max(durations):.2f}s")
    if args.asr:
        cers = [r["cer"] for r in report if "cer" in r]
        if cers:
            print(f"CER médio {np.mean(cers):.1%}, pior {max(cers):.1%}")
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 1 if failed or manifest_errors else 0


if __name__ == "__main__":
    sys.exit(main())
