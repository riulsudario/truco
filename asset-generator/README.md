# asset-generator

Local pipeline that generates pixel art sprites and tiles for the truco game
with ComfyUI on an 8 GB GPU (developed on an RTX 4060 Laptop, WSL2). Free to
run, no paid APIs.

It works in two phases:

1. **Validation**: six assets (table, chair, plant, floor tile, two
   characters), a demo scene and a review page. Nothing else is generated.
2. **Production**: the full catalog, only after an explicit approval that
   freezes the visual profile. `production` and `category` refuse to run
   without it, or if anything that defines the look changed since.

## Setup

```bash
scripts/setup.sh          # ComfyUI + nodes at pinned commits, patches, venv, weights
.venv/bin/python generate.py doctor
```

Put the references in `references/` (`world.png` for the map, `table.png`
for the match scene). They are only read, never modified.

## Commands

| command | what it does |
| --- | --- |
| `generate.py doctor [--hashes] [--server]` | GPU, CUDA, ComfyUI, nodes, patches, weights, references |
| `generate.py palette [--force]` | extract each profile's palette from its reference |
| `generate.py validate [--assets a,b] [--new-round]` | generate the six phase 1 assets; `--new-round` adds candidates without touching old ones |
| `generate.py preview [--port N]` | review page at http://127.0.0.1:8765 |
| `generate.py scene` | re-render `output/validation/scene*.png` from the current choices |
| `generate.py approve [--yes] [--note]` | freeze the profile and copy the selected candidates to `output/approved/` |
| `generate.py production` / `category NAME` | production catalogs, gated on the approval |
| `generate.py resume` | requeue interrupted candidates and continue |

## How it generates

Model stack (licences checked on the model cards, all allow commercial use of
the output):

| weight | role | licence |
| --- | --- | --- |
| SDXL base 1.0 | base model | CreativeML OpenRAIL++-M |
| sdxl-vae-fp16-fix | VAE that is stable in fp16 | MIT |
| nerijs/pixel-art-xl | pixel art LoRA | CreativeML OpenRAIL-M |
| LCM LoRA SDXL | 8 sampling steps | CreativeML OpenRAIL++-M |
| IP-Adapter Plus SDXL (ViT-H) | style from the reference | Apache-2.0 |
| LayerDiffuse SDXL attn + decoder | native transparency | CreativeML OpenRAIL-M |

FLUX.1-dev was ruled out by its non-commercial licence; FLUX.1-schnell is
Apache-2.0 but too heavy for 8 GB together with an IP-Adapter.

- **Visual conditioning**: IP-Adapter in "style transfer" mode, fed with four
  square crops of the reference (bar, plants, pool table, entrance). The whole
  map at higher weight leaked content into the sprites.
- **Transparency**: LayerDiffuse generates the alpha channel directly; no
  background removal.
- **Tiles**: circular padding in the UNet and VAE (seamless-tiling node), then
  an automatic seam check and a 5x5 repeat preview.
- **Pixel art**: the 1024 px output is snapped to the profile palette
  (extracted from the reference, CIELAB distance), then reduced by majority
  vote per block, despeckled and outlined. No interpolation anywhere, so no
  blended colours or halos. Alpha ends up as 0, 255 or the flat shadow value.
- **Scale**: one 32 px game tile holds 2x2 ceramic squares of reference A
  (~38 px per metre); target sizes in `catalogs/validation.yaml` follow that.

### Local patches

`patches/` holds two small fixes for nodes that lag behind current ComfyUI;
`setup.sh` applies them and `doctor` checks they are applied.

- `ComfyUI-layerdiffuse`: the old `("lora", ...)` patch tuple is converted to a
  `LoRAAdapter` (otherwise ComfyUI ignores the transparency weights), and the
  RGBA decode no longer uses the removed `JoinImageWithAlpha` method.
- `ComfyUI-seamless-tiling`: `CircularVAEDecode` patches the VAE in place and
  restores it instead of deep-copying it, which fails on current ComfyUI.

The tiling node changes conv layers of the shared model in place, so sprite
graphs include it with `tiling: disable`; results do not depend on run order.

## State, outputs and reproducibility

- `output/state.db` (SQLite): assets, candidates, every status change
  (`pending → generating → generated → processing → validated | failed`,
  then `approved`), reviews and approvals. Interrupted work is requeued by
  `resume`. A failing slot is retried with a new seed up to `max_retries`.
- Files are never overwritten: `output/validation/<asset>/r<round>_s<slot>_a<attempt>_<seed>.png`
  plus `_raw.png` (1024 px from ComfyUI), `_x8.png`, `.json` (prompt,
  negative, seed, sampling, weights and their sha256, reference hash, timings,
  VRAM peak, QC) and `.workflow.json` (the exact ComfyUI graph, which can be
  queued again to reproduce the image).
- `config/models.lock.json`: sha256 of every weight. ComfyUI and node commits
  are pinned in `config/settings.yaml`.
- `output/approved/`: selected sprites, a Phaser atlas (JSON Hash with
  `anchor` per frame), a Tiled tileset (`.tsj`) and a frozen copy of the
  profile, palette, reference and lock file.

## Tests

```bash
.venv/bin/python -m pytest              # unit tests, fake backend, no GPU
.venv/bin/python -m pytest -m integration   # real generation through ComfyUI
```

The unit tests prove catalog validation, state, processing, spritesheets,
retries, resume and the approval gate. They use a fake backend and do not
prove that generation works; the integration tests do, and they skip with the
missing dependency named when ComfyUI, a weight or the GPU is absent.

## Profiles

`world_topdown` (map, reference A) and `table_perspective` (match scene,
reference B) are separate files with separate palettes and seed salts. Only
`world_topdown` is used in phase 1; an approval covers only the profiles it
froze, so table-scene production needs its own approval.
