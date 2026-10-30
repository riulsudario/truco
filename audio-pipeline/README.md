# Pipeline de vozes

Gera as falas dos personagens do truco com síntese neural local e entrega OGG/MP3 prontos para o
jogo. Nada roda em produção: o jogo só toca arquivos estáticos.

```
referência gravada ─▶ generate.py ─▶ output/candidates/   (WAV original + JSON com parâmetros)
                                         │
                       review.py ◀───────┘   ouvir, aprovar, rejeitar, escolher a melhor
                                         │
                   process_audio.py ─▶ output/selected/    (corte, compressão, loudnorm, limitador)
                          export.py ─▶ output/final/       (OGG/Opus + MP3) + manifests/audio_manifest.json
                export.py --install ─▶ apps/client/public/sfx/vozes/ + src/lib/voice-manifest.json
                        validate.py     integridade, duração, silêncio, clipping, duplicatas, manifesto, Whisper
```

## Modelo

[Chatterbox Multilingual](https://github.com/resemble-ai/chatterbox) da Resemble AI, licença MIT
(código e pesos), uso comercial permitido. Usamos o **Single Language Pack pt-BR**
(`ResembleAI/Chatterbox-Multilingual-pt-br`), um finetune do V3 só para português do Brasil. O
checkpoint multilíngue geral V3 fica disponível com `--model v3` para comparação.

O que foi conferido no código instalado (commit `5de7a54` do master; a versão 0.1.7 do PyPI não
carrega o V3):

- `generate(text, language_id, audio_prompt_path, exaggeration=0.5, cfg_weight=0.5,
  temperature=0.8, repetition_penalty=1.2, min_p=0.05, top_p=1.0)`. Não há parâmetro de seed: o
  `generate.py` fixa `torch`, `numpy` e `random` antes de cada tomada, com uma semente derivada de
  personagem, fala e variação. A mesma configuração gera o mesmo áudio.
- Idioma `pt`. O texto é passado para minúsculas pelo tokenizer, então MAIÚSCULAS não mudam nada:
  o grito vem de `exaggeration` e da referência.
- A referência dá timbre, sotaque e energia. O modelo lê só os primeiros 10 s (6 s para o prompt de
  fala). Referência em outro idioma passa o sotaque desse idioma; a documentação recomenda
  `cfg_weight: 0` nesse caso.
- Sem referência, o modelo usa uma voz embutida (`conds.pt`, feminina, F0 mediano de ~235 Hz).
  Serve só para testar o pipeline (`--builtin`), nunca como personagem.
- Toda saída leva a marca d'água inaudível Perth da Resemble. Não há opção para desligar.
- O `s3gen_v3.pt` do pack não traz dois buffers fixos do tokenizer, que o modelo recria sozinho. O
  Space oficial do pack carrega com `strict=False` pelo mesmo motivo. O `generate.py` faz o mesmo e
  falha se faltar qualquer outra chave.

Alternativas descartadas pela licença dos pesos: XTTS-v2 (CPML, não comercial), F5-TTS e Fish
Speech/OpenAudio (CC-BY-NC). Kokoro e Piper têm vozes pt-BR com licença livre, mas sem clonagem
por referência e com pouca expressividade. Não foram testadas aqui.

## Instalação

Precisa de FFmpeg com `libopus` e `libmp3lame` no sistema. O resto fica isolado na `.venv`:

```bash
cd audio-pipeline
curl -LsSf https://astral.sh/uv/install.sh | UV_NO_MODIFY_PATH=1 sh   # uv em ~/.local/bin, sem mexer no PATH
~/.local/bin/uv venv --python 3.11 .venv
~/.local/bin/uv pip install --python .venv/bin/python -r requirements.txt --index-strategy unsafe-best-match
.venv/bin/python scripts/check_environment.py
```

Na primeira geração, os pesos (~5 GB, mais 1,6 GB do Whisper se usar `--asr`) são baixados para o cache do Hugging Face (`~/.cache/huggingface`).
`models/` só guarda links para lá. Na máquina de referência (RTX 4060 Laptop com 8 GB, WSL2), o modelo
carrega em ~15 s e cada tomada leva ~2-3 s, então as 720 levam ~30 min. Em CPU funciona, mas é bem
mais lento.

## Uso

Todos os comandos rodam de dentro de `audio-pipeline/` com `.venv/bin/python`.

```bash
# 0. Referências (ver references/README.md)
scripts/prepare_reference.py dona_cida ~/Downloads/cida.opus
.venv-kokoro/bin/python scripts/invent_reference.py   # ou vozes inventadas, sem pessoa real (abaixo)

# 1. Prova de conceito
scripts/generate.py --phase A                 # "SEIS, LADRÃO!" × 6 vozes × 3 = 18
scripts/generate.py --phase B                 # 5 falas × 5 estilos × 6 vozes, em output/phase_b/
scripts/validate.py --asr                     # Whisper local confere o que foi dito

# 2. Revisão
scripts/auto_review.py                        # pré-aprova o que o Whisper entendeu (precisa do --asr)
scripts/review.py                             # http://127.0.0.1:8765

# 3. Biblioteca (só depois de aprovar a fase A)
scripts/generate.py --all                     # 40 × 6 × 3 = 720
scripts/generate.py --character tiao
scripts/generate.py --character jessica --category truco
scripts/generate.py --line seis_001 --variants 5
scripts/generate.py --character ze --line truco_004 --variant 2 --force   # regera uma tomada

# 4. Entrega
scripts/process_audio.py                      # trata as aprovadas
scripts/export.py --install                   # OGG/MP3 + manifesto, e copia para o jogo
scripts/validate.py --stage final
```

A geração retoma de onde parou. Uma tomada só é refeita quando muda o texto, os parâmetros, a seed
ou o arquivo de referência. `--dry-run` lista o que seria gerado.

`--builtin` gera com a voz embutida em `output/smoke/`, para testar o pipeline sem referências.

## Vozes inventadas

Enquanto não houver gravações autorizadas, o elenco usa referências sintéticas, sem pessoa real.
O `invent_reference.py` fala um texto do personagem com o
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0, local, CPU), numa voz que mistura
dois voicepacks dele (um pt-BR com um de outro idioma, para dar um timbre que não existe no
Kokoro), e passa o resultado pelo `prepare_reference.py`. A receita fica no bloco `synthetic` de
cada personagem em `characters.yaml`, e o `consent` diz que a voz é sintética e provisória. As
misturas foram escolhidas medindo o tom: Tonhão ~85 Hz, Tião ~105, Zé ~130, Juninho ~145, Dona
Cida ~155, Jéssica ~185 nas tomadas da fase A.

O Kokoro roda numa venv separada para não misturar dependências com o Chatterbox:

```bash
~/.local/bin/uv venv --python 3.11 .venv-kokoro
~/.local/bin/uv pip install --python .venv-kokoro/bin/python --index-url https://download.pytorch.org/whl/cpu \
  --extra-index-url https://pypi.org/simple --index-strategy unsafe-best-match torch kokoro soundfile pyyaml
```

Para trocar por uma gravação de verdade: `prepare_reference.py`, apagar o bloco `synthetic`,
preencher o `consent` com quem gravou e regerar (a mudança de referência invalida as tomadas
antigas sozinha).

## Configuração

- `data/lines.json`: as 40 falas, sem alteração. `id` estável (`seis_001`), categoria (`truco`,
  `seis`, `nove`, `doze`, `provocacao`, `vitoria`, `derrota`). Para mudar a pronúncia sem mexer no
  original, use `tts_overrides: {"truco_004": "Truco, filho duma égua!"}`. Para um personagem só,
  use `tts_overrides` dentro dele em `characters.yaml`. O manifesto guarda os dois textos.
- `config/characters.yaml`: elenco. Cada personagem tem referência, `consent`, parâmetros base e
  ajuste por categoria. Para incluir um personagem, adicione uma entrada aqui, crie
  `references/<id>/` e coloque o id em `VOICES` (`packages/protocol/src/avatar.ts`).
- `config/generation.yaml`: modelo, padrões, `base_seed`, número de variações, estilos da fase B,
  alvos de tratamento (−16 LUFS, pico −1,5 dBTP) e limites da validação.

Precedência dos parâmetros: padrões < personagem < categoria (ou estilo, na fase B).

## Nomes de arquivo

`<personagem>/<categoria>/<texto_sem_acento_e_pontuacao>_<variação>.wav`, por exemplo
`dona_cida/truco/subi_no_muro_cai_de_costas_truco_seu_bosta_01.wav`. Na fase B, a pasta do meio é
o estilo.

## No jogo

O servidor não sintetiza nem escolhe áudio. Cada navegador deriva a fala dos mesmos eventos
autoritativos do servidor (`apps/client/src/lib/voice.ts`): a semente vem do número da mão, da
cadeira e do valor da aposta, e escolhe a fala e a tomada. Assim todos na sala ouvem a mesma
variação, sem mensagem nova no protocolo, e o treino offline funciona igual.

- A voz de cada cadeira vem de `avatar.voice`. Os bots da casa têm voz fixa: Tonhão, Dona Cida,
  Zé do Bar → Zé, Seu Lunga → Tião, Tia Neide → Jéssica, Pé de Pano → Juninho. Quem não escolheu
  ganha uma voz do gênero do corpo do boneco, sorteada pelo apelido.
- Fala sem tomada aprovada na voz de quem grita cai no pacote do time (`public/sfx/falas`), como era
  antes.
- Volume próprio para as falas e mudo por personagem no painel da jukebox. No máximo duas falas ao
  mesmo tempo. As falas de truco e seis das vozes da mesa são carregadas a cada mão. O navegador
  escolhe OGG/Opus ou MP3.

## Manifesto

`manifests/audio_manifest.json` (completo) tem, por fala, as tomadas aprovadas de cada personagem
com variação, caminhos OGG/MP3, tamanhos, duração, status, modelo, parâmetros, seed e texto falado.
O jogo recebe a versão enxuta em `apps/client/src/lib/voice-manifest.json`. A revisão grava as
decisões em `manifests/review.json`.
