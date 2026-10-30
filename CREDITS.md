# Créditos

| Uso                       | Asset                                                                                                                                                                   | Licença                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Bonecos (peças em camada) | [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)                                     | CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0, CC0 |
| Móveis do cenário         | [Furniture Kit, Kenney](https://opengameart.org/node/80260)                                                                                                             | CC0                                    |
| Efeitos sonoros           | [Casino Audio](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) e [Interface Sounds](https://opengameart.org/content/interface-sounds), Kenney | CC0                                    |
| Fonte do texto            | [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans)                                                                                                        | OFL                                    |
| Fonte dos títulos         | [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)                                                                                                      | OFL                                    |

As peças do boneco saem de `apps/client/scripts/build-avatar.mjs`, que baixa do LPC (num
commit fixo) só o que está no catálogo (`packages/protocol/src/avatar.ts`). Cada peça tem
seus autores e licenças, listados em
[`apps/client/public/avatar/CREDITS.csv`](apps/client/public/avatar/CREDITS.csv). Por
causa do CC-BY-SA, as imagens derivadas seguem a mesma licença.

O cenário do bar é uma imagem fornecida pelo time (`apps/client/scene-src/bar.png`).
`apps/client/scripts/build-table-front.mjs` gera o fundo e a camada da frente da mesa em
WebP. A garrafa tem o rótulo de uma marca real: trocar antes de publicar.

A jukebox toca vídeos dos canais oficiais no YouTube pelo player embutido (ver
`packages/protocol/src/jukebox.ts`); nenhum áudio é baixado nem redistribuído.

Sons das provocações: risada ([Group Giggling](https://opengameart.org/content/group-giggling)),
palmas ([Well Done, qubodup](https://opengameart.org/content/well-done)) e raiva
([Male grunt/yelling](https://opengameart.org/content/male-gruntyelling-sounds)), todos CC0.
As 40 falas gritadas (truco, seis/nove/doze, provocações, vitória e derrota) vêm do pacote
gravado pelo time (`apps/client/sound-src/falas.zip`, convertido por
`scripts/build-voices.mjs`). As mesmas falas nas vozes dos seis personagens
(`public/sfx/vozes/`) são sintetizadas localmente pelo `audio-pipeline/` com o
[Chatterbox Multilingual pt-BR](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-pt-br)
(MIT), a partir de vozes inventadas com o [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
(Apache-2.0), sem nenhuma pessoa real. Os sons de choro, olhos e caveira foram feitos aqui com
a voz pt-BR do Windows mais efeitos (sox); fogo e coração são sintetizados.
