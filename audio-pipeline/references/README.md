# Reference recordings

Each character needs a `reference.wav` in its folder. That is where Chatterbox takes timbre,
accent, age and energy from: the numbers in `config/characters.yaml` only tune the delivery on top
of it. With no reference there is no character voice, and the pipeline does not invent one.

Only your own recording, or one from someone who authorized this use, is allowed. Record who it is
in the character's `consent` field in `config/characters.yaml` (e.g. `"Jane Doe, authorized in
writing on 2026-10-30"`). Without it `generate.py` refuses to use the file.

## What to record

- **10 to 15 seconds of continuous speech**, a single person, in Brazilian Portuguese. The model
  only reads the first 10 s, and the first 6 weigh the most: start talking right away, no "hello,
  testing".
- **Already in character.** The reference sets the tone. A calm reading becomes a calm Tonhão.
  Record with the accent, pace and energy the voice should have, ideally talking about truco:
  - Tião and Dona Cida: countryside Goiás, mocking, a shout in the middle.
  - Juninho and Jéssica: fast, laughing, taunting.
  - Zé: drawling, ironic, no shouting.
  - Tonhão: loud and intense from start to finish (without blowing out the microphone).
- **Dry room**: a room with curtains or clothes nearby, no music, TV, bathroom echo or fan. A phone
  a hand's width from the mouth is fine.
- Any format: WhatsApp audio, phone recorder, `.wav`, `.m4a`, `.mp3`.

Sample text (say it your own way, no need to read it):

> Ô, senta aí que hoje cê vai aprender a jogar truco. Eu jogo desde moleque, rapaz, e nunca vi
> ninguém com uma mão tão ruim. Pediu truco? Então segura, que eu vou pedir seis. TRUCO, LADRÃO!
> Ah, não acredito, cê tinha o zap e não jogou?

## Prepare

```bash
.venv/bin/python scripts/prepare_reference.py dona_cida ~/Downloads/cida.opus
.venv/bin/python scripts/prepare_reference.py tonhao recording.m4a --start 3.5   # skips the start
```

Converts to mono 24 kHz, trims silence and long pauses, normalizes and caps at 12 s. Then:

```bash
.venv/bin/python scripts/generate.py --phase A --character dona_cida
```

## Female voices

Dona Cida and Jéssica need recordings of women. Don't use a pitch-shifted male voice: Chatterbox
copies the pitch-shift artifacts along with the timbre, and the result sounds artificial.

## Changing a character's voice

Replace `reference.wav` (and `consent`). `generate.py` notices the change through the file hash and
regenerates that character's takes on the next run; the old ones are overwritten.
