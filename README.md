# Truco Paulista

Online truco paulista with the short deck (Q, J, K, A, 2, 3), rooms of up to 4 players, bots that
fill the table and predefined taunts. Pixel art look. The game itself is in Brazilian Portuguese;
the code is in English.

Play it at [truco.riul.dev](https://truco.riul.dev).

## Running

```sh
pnpm install
pnpm dev          # Vite on :5173 + Worker (wrangler dev) on :8787
```

Open http://localhost:5173. "Partida local" (practice) runs entirely in the browser; "Jogar
online" uses the local Worker.

## Commands

| Command       | What it does                                                      |
| ------------- | ----------------------------------------------------------------- |
| `pnpm check`  | types + ESLint + Prettier + engine, bots, client and server tests |
| `pnpm e2e`    | build and a full Playwright match against the real Worker         |
| `pnpm deploy` | build and `wrangler deploy` (needs `npx wrangler login`)          |

## Layout

```
packages/engine    pure rules: reduce(state, action) → { state, events }
packages/bots      AI: Monte Carlo over the cards it can't see + truco thresholds
packages/protocol  client ↔ server messages (valibot) and the taunt catalog
apps/server        Worker + Durable Objects: Room (one per room) and Lobby (public list)
apps/client        Svelte 5 + Vite
audio-pipeline     local voice synthesis for the characters' shouted lines
e2e                Playwright
```

The server is authoritative: the client sends intents, the `Room` applies them to the engine and
sends each seat only what it is allowed to see (`toPlayerView`). The room logic lives in
`room-core.ts`, with no Cloudflare APIs, and is tested with a fake clock.

## Implemented rules

- Order 3 > 2 > A > K > J > Q; the manilha is the rank after the vira, wrapping around (vira 3 → Q).
  Manilha suits: clubs (zap) > hearts > spades > diamonds.
- Best of 3 rounds with the tie rules; face-down cards from the 2nd round on.
- Truco → six → nine → twelve, with accept and run; raising only on your own turn to play,
  never as the answer to a call. Running takes both partners;
  accepting takes one.
- Hand of eleven (the team sees the partner's cards, worth 3, running gives 1) and iron hand
  (played blind, no truco). Game to 12.

## Glossary

Truco terms with no good English equivalent keep their Portuguese name in the code:

| Term         | Meaning                                                              |
| ------------ | -------------------------------------------------------------------- |
| truco        | the game, and the call that raises the hand's stake to 3             |
| vira         | the card turned up after the deal; it sets the manilha               |
| manilha      | the trump rank (the one right after the vira)                        |
| zap          | the strongest manilha, the one of clubs                              |
| mão de onze  | hand of eleven (`eleven` in the code): a team at 11 decides to play  |
| mão de ferro | iron hand (`iron` in the code): both teams at 11, cards played blind |

## Assets

See `CREDITS.md`. The cards are drawn in CSS/SVG; the avatar layers come in through `assets-src/`
(instructions there).
