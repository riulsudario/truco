# Gravações de referência

Cada personagem precisa de um `reference.wav` na sua pasta. É dele que o Chatterbox tira timbre,
sotaque, idade e energia: os números do `config/characters.yaml` só ajustam a interpretação por
cima. Sem referência não há voz de personagem, e o pipeline não inventa uma.

Só vale gravação própria ou de alguém que autorizou esse uso. Registre quem é no campo `consent`
do personagem em `config/characters.yaml` (ex.: `"Fulana, autorizou por escrito em 30/10/2026"`).
Sem isso o `generate.py` se recusa a usar o arquivo.

## O que gravar

- **10 a 15 segundos de fala corrida**, uma pessoa só, em português do Brasil. O modelo lê só os
  primeiros 10 s, e os 6 primeiros pesam mais na voz: comece falando, sem "alô, testando".
- **Já no personagem.** A referência dita o tom. Uma leitura calma vira um Tonhão calmo. Grave com
  o sotaque, o ritmo e a energia que a voz deve ter, de preferência falando de truco:
  - Tião e Dona Cida: interior de Goiás, debochados, um grito no meio.
  - Juninho e Jéssica: rápido, rindo, provocando.
  - Zé: arrastado, irônico, sem gritar.
  - Tonhão: alto e intenso do começo ao fim (sem estourar o microfone).
- **Ambiente seco**: quarto com cortina ou roupa por perto, sem música, TV, eco de banheiro ou
  ventilador. Celular a um palmo da boca serve.
- Qualquer formato: áudio de WhatsApp, gravador do celular, `.wav`, `.m4a`, `.mp3`.

Exemplo de texto (fale do seu jeito, não precisa ler):

> Ô, senta aí que hoje cê vai aprender a jogar truco. Eu jogo desde moleque, rapaz, e nunca vi
> ninguém com uma mão tão ruim. Pediu truco? Então segura, que eu vou pedir seis. TRUCO, LADRÃO!
> Ah, não acredito, cê tinha o zap e não jogou?

## Preparar

```bash
.venv/bin/python scripts/prepare_reference.py dona_cida ~/Downloads/cida.opus
.venv/bin/python scripts/prepare_reference.py tonhao gravacao.m4a --start 3.5   # pula o começo
```

Converte para mono 24 kHz, corta silêncio e pausas longas, normaliza e limita a 12 s. Depois:

```bash
.venv/bin/python scripts/generate.py --phase A --character dona_cida
```

## Vozes femininas

Dona Cida e Jéssica precisam de gravações de mulheres. Não use voz masculina com pitch alterado:
o Chatterbox copia os artefatos do pitch shift junto com o timbre, e o resultado soa artificial.

## Trocar a voz de um personagem

Substitua o `reference.wav` (e o `consent`). O `generate.py` percebe a troca pelo hash do arquivo e
regera as tomadas daquele personagem na próxima execução; as antigas são sobrescritas.
