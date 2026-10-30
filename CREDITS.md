# Credits

| Use                     | Asset                                                                                                                                                                     | License                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Avatars (layered parts) | [Universal LPC Spritesheet Character Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)                                       | CC-BY-SA 3.0, GPL 3.0, OGA-BY 3.0, CC0 |
| Scene furniture         | [Furniture Kit, Kenney](https://opengameart.org/node/80260)                                                                                                               | CC0                                    |
| Sound effects           | [Casino Audio](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) and [Interface Sounds](https://opengameart.org/content/interface-sounds), Kenney | CC0                                    |
| Body font               | [Pixelify Sans](https://fonts.google.com/specimen/Pixelify+Sans)                                                                                                          | OFL                                    |
| Title font              | [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)                                                                                                        | OFL                                    |

The avatar parts come from `apps/client/scripts/build-avatar.mjs`, which downloads from the LPC
(at a pinned commit) only what is in the catalog (`packages/protocol/src/avatar.ts`). Each part has
its own authors and licenses, listed in
[`apps/client/public/avatar/CREDITS.csv`](apps/client/public/avatar/CREDITS.csv). Because of
CC-BY-SA, the derived images carry the same license.

The bar scene is an image provided by the team (`apps/client/scene-src/bar.png`).
`apps/client/scripts/build-table-front.mjs` builds the background and the table's front layer as
WebP. The bottle shows a real brand's label.

The jukebox plays videos from the official YouTube channels through the embedded player (see
`packages/protocol/src/jukebox.ts`); no audio is downloaded or redistributed.

Taunt sounds: clap ([Well Done, qubodup](https://opengameart.org/content/well-done), CC0).
Laugh, cry and angry are meme sounds cut from YouTube videos, with no declared license:
[laughing cat](https://www.youtube.com/watch?v=GTXUWhmjCog),
[crying Banana Cat](https://www.youtube.com/watch?v=pBUs2R9JV5M) and
[grrr](https://www.youtube.com/watch?v=zwJ2xG1QUqM).
The 40 shouted lines (truco, six/nine/twelve, taunts, win and loss) come from the pack recorded by
the team (`apps/client/sound-src/falas.zip`, converted by `scripts/build-voices.mjs` into
`public/sfx/lines/`). The same lines in the six characters' voices (`public/sfx/voices/`) are
synthesized locally by `audio-pipeline/` with
[Chatterbox Multilingual pt-BR](https://huggingface.co/ResembleAI/Chatterbox-Multilingual-pt-br)
(MIT), from voices invented with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
(Apache-2.0), with no real person. The eyes and skull sounds were made here with the Windows pt-BR
voice plus effects (sox); fire and heart are synthesized.
