# Truco Paulista

Truco paulista online com baralho limpo (Q, J, K, A, 2, 3), salas de até 4 pessoas,
bots que completam a mesa e provocações pré-definidas. Visual pixel art com skins de
mesa. Tudo em português.

## Rodando

```sh
pnpm install
pnpm dev          # Vite em :5173 + Worker (wrangler dev) em :8787
```

Abra http://localhost:5173. "Treino contra bots" roda inteiro no navegador; "Jogar
online" usa o Worker local.

## Comandos

| Comando       | O que faz                                                     |
| ------------- | ------------------------------------------------------------- |
| `pnpm check`  | tipos + ESLint + Prettier + testes de engine, bots e servidor |
| `pnpm e2e`    | build e partida completa no Playwright contra o Worker real   |
| `pnpm deploy` | build e `wrangler deploy` (precisa de `npx wrangler login`)   |

## Estrutura

```
packages/engine    regras puras: reduce(estado, ação) → { estado, eventos }
packages/bots      IA: Monte Carlo sobre as cartas que ela não vê + limiares de truco
packages/protocol  mensagens cliente ↔ servidor (valibot) e catálogo de provocações
apps/server        Worker + Durable Objects: Room (uma por sala) e Lobby (lista pública)
apps/client        Svelte 5 + Vite
e2e                Playwright
```

O servidor é autoritativo: o cliente manda intenções, o `Room` aplica no engine e
devolve para cada cadeira só o que ela pode ver (`toPlayerView`). A lógica da sala vive
em `room-core.ts`, sem APIs da Cloudflare, e é testada com relógio falso.

## Regras implementadas

- Ordem 3 > 2 > A > K > J > Q; manilha é o rank seguinte à vira, em ciclo (vira 3 → Q).
  Naipes da manilha: paus (zap) > copas > espadas > ouros.
- Melhor de 3 vazas com as regras de cangar; carta encoberta a partir da 2ª vaza.
- Truco → seis → nove → doze, com aceitar, correr e aumentar.
- Mão de onze (o time vê as cartas do parceiro, vale 3, correr dá 1) e mão de ferro
  (às cegas, sem truco). Jogo até 12.

## Assets

Ver `CREDITS.md`. As cartas hoje são desenhadas em CSS/SVG; os packs CC0 entram pelo
`assets-src/` (instruções lá).
