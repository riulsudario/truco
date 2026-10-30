# Voice pipeline

Generates the truco characters' lines with local neural synthesis and delivers OGG/MP3 files ready
for the game. Nothing runs in production: the game only plays static files.

```
recorded reference ─▶ generate.py ─▶ output/candidates/   (original WAV + JSON with parameters)
                                         │
                       review.py ◀───────┘   listen, approve, reject, pick the best
                                         │
                   process_audio.py ─▶ output/selected/    (trim, compression, loudnorm, limiter)
                          export.py ─▶ output/final/       (OGG/Opus + MP3) + manifests/audio_manifest.json
                export.py --install ─▶ apps/client/public/sfx/voices/ + src/lib/voice-manifest.json
                        validate.py     integrity, duration, silence, clipping, duplicates, manifest, Whisper
```

## Model

[Chatterbox Multilingual](https://github.com/resemble-ai/chatterbox) by Resemble AI, MIT license
(code and weights), commercial use allowed. We use the **pt-BR Single Language Pack**
(`ResembleAI/Chatterbox-Multilingual-pt-br`), a V3 finetune for Brazilian Portuguese only. The
general V3 multilingual checkpoint is available with `--model v3` for comparison.

What was checked in the installed code (master commit `5de7a54`; the PyPI release 0.1.7 can't
load V3):

- `generate(text, language_id, audio_prompt_path, exaggeration=0.5, cfg_weight=0.5,
  temperature=0.8, repetition_penalty=1.2, min_p=0.05, top_p=1.0)`. There is no seed parameter:
  `generate.py` seeds `torch`, `numpy` and `random` before each take, with a seed derived from the
  character, line and variant. The same configuration produces the same audio.
- Language `pt`. The tokenizer lowercases the text, so CAPITALS change nothing: the shouting comes
  from `exaggeration` and from the reference.
- The reference provides timbre, accent and energy. The model only reads the first 10 s (6 s for
  the speech prompt). A reference in another language carries that language's accent; the docs
  recommend `cfg_weight: 0` in that case.
- Without a reference, the model uses a built-in voice (`conds.pt`, female, median F0 around
  235 Hz). It is only for testing the pipeline (`--builtin`), never as a character.
- Every output carries Resemble's inaudible Perth watermark. There is no option to turn it off.
- The pack's `s3gen_v3.pt` lacks two fixed tokenizer buffers, which the model recreates by itself.
  The pack's official Space loads it with `strict=False` for the same reason. `generate.py` does
  the same and fails if any other key is missing.

Alternatives ruled out by their weights' license: XTTS-v2 (CPML, non-commercial), F5-TTS and Fish
Speech/OpenAudio (CC-BY-NC). Kokoro and Piper have freely licensed pt-BR voices, but no reference
cloning and little expressiveness. They were not tested here.

## Installation

Needs FFmpeg with `libopus` and `libmp3lame` on the system. Everything else stays isolated in `.venv`:

```bash
cd audio-pipeline
curl -LsSf https://astral.sh/uv/install.sh | UV_NO_MODIFY_PATH=1 sh   # uv in ~/.local/bin, PATH untouched
~/.local/bin/uv venv --python 3.11 .venv
~/.local/bin/uv pip install --python .venv/bin/python -r requirements.txt --index-strategy unsafe-best-match
.venv/bin/python scripts/check_environment.py
```

On the first generation, the weights (~5 GB, plus 1.6 GB for Whisper when using `--asr`) are
downloaded to the Hugging Face cache (`~/.cache/huggingface`). `models/` only holds links to it. On
the reference machine (RTX 4060 Laptop with 8 GB, WSL2), the model loads in ~15 s and each take
takes ~2-3 s, so the 720 takes need ~30 min. It works on CPU, but much more slowly.

## Usage

Every command runs from inside `audio-pipeline/` with `.venv/bin/python`.

```bash
# 0. References (see references/README.md)
scripts/prepare_reference.py dona_cida ~/Downloads/cida.opus
.venv-kokoro/bin/python scripts/invent_reference.py   # or invented voices, no real person (below)

# 1. Proof of concept
scripts/generate.py --phase A                 # "SEIS, LADRÃO!" × 6 voices × 3 = 18
scripts/generate.py --phase B                 # 5 lines × 5 styles × 6 voices, in output/phase_b/
scripts/validate.py --asr                     # local Whisper checks what was said

# 2. Review
scripts/auto_review.py                        # pre-approves what Whisper understood (needs --asr)
scripts/review.py                             # http://127.0.0.1:8765

# 3. Library (only after approving phase A)
scripts/generate.py --all                     # 40 × 6 × 3 = 720
scripts/generate.py --character tiao
scripts/generate.py --character jessica --category truco
scripts/generate.py --line six_001 --variants 5
scripts/generate.py --character ze --line truco_004 --variant 2 --force   # regenerates one take

# 4. Delivery
scripts/process_audio.py                      # processes the approved takes
scripts/export.py --install                   # OGG/MP3 + manifest, and copies into the game
scripts/validate.py --stage final
```

Generation resumes where it stopped. A take is only redone when the text, the parameters, the seed
or the reference file change. `--dry-run` lists what would be generated.

`--builtin` generates with the built-in voice into `output/smoke/`, to test the pipeline without
references.

## Invented voices

Until there are authorized recordings, the cast uses synthetic references, with no real person.
`invent_reference.py` speaks a character text with
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0, local, CPU), in a voice that
blends two of its voicepacks (a pt-BR one with one from another language, to get a timbre that
doesn't exist in Kokoro), and runs the result through `prepare_reference.py`. The recipe lives in
each character's `synthetic` block in `characters.yaml`, and `consent` says the voice is synthetic
and provisional. The blends were picked by measuring pitch: Tonhão ~85 Hz, Tião ~105, Zé ~130,
Juninho ~145, Dona Cida ~155, Jéssica ~185 in the phase A takes.

Kokoro runs in a separate venv to keep its dependencies apart from Chatterbox:

```bash
~/.local/bin/uv venv --python 3.11 .venv-kokoro
~/.local/bin/uv pip install --python .venv-kokoro/bin/python --index-url https://download.pytorch.org/whl/cpu \
  --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match torch kokoro soundfile pyyaml
```

To switch to a real recording: `prepare_reference.py`, delete the `synthetic` block, fill in
`consent` with who recorded it and regenerate (changing the reference invalidates the old takes on
its own).

## Configuration

- `data/lines.json`: the 40 lines, unchanged. Stable `id` (`six_001`), category (`truco`, `six`,
  `nine`, `twelve`, `taunt`, `win`, `loss`). To change the pronunciation without touching the
  original, use `tts_overrides: {"truco_004": "Truco, filho duma égua!"}`. For a single character,
  use `tts_overrides` inside it in `characters.yaml`. The manifest keeps both texts.
- `config/characters.yaml`: the cast. Each character has a reference, `consent`, base parameters
  and per-category tweaks. To add a character, add an entry here, create `references/<id>/` and
  put the id in `VOICES` (`packages/protocol/src/avatar.ts`).
- `config/generation.yaml`: model, defaults, `base_seed`, number of variants, phase B styles,
  processing targets (−16 LUFS, −1.5 dBTP peak) and validation limits.

Parameter precedence: defaults < character < category (or style, in phase B).

## File names

`<character>/<category>/<text_without_accents_or_punctuation>_<variant>.wav`, for example
`dona_cida/truco/subi_no_muro_cai_de_costas_truco_seu_bosta_01.wav`. In phase B, the middle folder
is the style. The slug comes from the spoken Portuguese text, so it stays in Portuguese.

## In the game

The server neither synthesizes nor picks audio. Each browser derives the line from the same
authoritative server events (`apps/client/src/lib/voice.ts`): the seed comes from the hand number,
the seat and the stake, and picks the line and the take. That way everyone in the room hears the
same variant, with no new protocol message, and offline practice works the same.

- Each seat's voice comes from `avatar.voice`. The house bots have fixed voices: Tonhão, Dona Cida,
  Zé do Bar → Zé, Seu Lunga → Tião, Tia Neide → Jéssica, Pé de Pano → Juninho. Players who didn't
  pick one get a voice matching their avatar's body, drawn from their nickname.
- A line with no approved take in the shouter's voice falls back to the team pack
  (`public/sfx/lines`), as before.
- The lines have their own volume and a per-character mute in the jukebox panel. At most two lines
  play at once. The truco and six lines of the voices at the table are preloaded every hand. The
  browser picks OGG/Opus or MP3.

## Manifest

`manifests/audio_manifest.json` (full) has, per line, each character's approved takes with variant,
OGG/MP3 paths, sizes, duration, status, model, parameters, seed and spoken text. The game gets the
slim version in `apps/client/src/lib/voice-manifest.json`. The review stores its decisions in
`manifests/review.json`.
