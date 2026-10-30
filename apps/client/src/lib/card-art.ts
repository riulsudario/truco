import { cardId, type Card, type Rank } from '@truco/engine'
import { isRed, SUIT_PIXELS } from './pixels'

/**
 * Cartas em 20×30 pixels, desenhadas em canvas: as mesmas no jogo (cartas na mesa) e no
 * estúdio (leques na mão dos personagens, pré-renderizados).
 */
export const CARD_ART = { w: 20, h: 30 } as const

const INK = '#1a1423'
const BACK = ['#b0322b', '#f4ecd8'] as const
const RANK_PIXELS: Record<Rank, string[]> = {
  Q: ['.##.', '#..#', '#..#', '#.##', '.###'],
  J: ['..##', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  A: ['.##.', '#..#', '####', '#..#', '#..#'],
  '2': ['###.', '...#', '.##.', '#...', '####'],
  '3': ['###.', '...#', '.##.', '...#', '###.'],
}

const cache = new Map<string, HTMLCanvasElement>()

function draw(key: string, paint: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cached = cache.get(key)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = CARD_ART.w
  canvas.height = CARD_ART.h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, CARD_ART.w, CARD_ART.h)
  paint(ctx)
  cache.set(key, canvas)
  return canvas
}

function bitmap(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number) {
  rows.forEach((row, j) =>
    [...row].forEach((cell, i) => {
      if (cell === '#') ctx.fillRect(x + i, y + j, 1, 1)
    }),
  )
}

export function cardFaceArt(card: Card): HTMLCanvasElement {
  return draw(cardId(card), (ctx) => {
    ctx.fillStyle = '#f7f1e1'
    ctx.fillRect(1, 1, CARD_ART.w - 2, CARD_ART.h - 2)
    ctx.fillStyle = isRed(card.suit) ? '#c0392b' : INK
    bitmap(ctx, RANK_PIXELS[card.rank], 2, 2)
    bitmap(ctx, SUIT_PIXELS[card.suit], 7, 12)
  })
}

export function cardBackArt(): HTMLCanvasElement {
  return draw('back', (ctx) => {
    ctx.fillStyle = BACK[1]
    ctx.fillRect(1, 1, CARD_ART.w - 2, CARD_ART.h - 2)
    ctx.fillStyle = BACK[0]
    for (let y = 2; y < CARD_ART.h - 2; y++) {
      for (let x = 2; x < CARD_ART.w - 2; x++) if ((x + y) % 4 < 2) ctx.fillRect(x, y, 1, 1)
    }
  })
}
