import type { Suit } from '@truco/engine'

/** Suits drawn pixel by pixel (7×7), so we don't depend on a font with the symbols. */
export const SUIT_PIXELS: Record<Suit, string[]> = {
  diamonds: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  hearts: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  spades: ['...#...', '..###..', '.#####.', '#######', '#######', '...#...', '..###..'],
  clubs: ['..###..', '..###..', '#######', '#######', '##.#.##', '...#...', '..###..'],
}

/** Converts the bitmap into an SVG path with one square per pixel equal to `on`. */
export function pixelPath(rows: string[], on = '#'): string {
  return rows
    .flatMap((row, y) => [...row].map((cell, x) => (cell === on ? `M${x} ${y}h1v1h-1z` : '')))
    .join('')
}

export const isRed = (suit: Suit) => suit === 'diamonds' || suit === 'hearts'

/** Colored bitmap: each character is a palette color; '.' is transparent. */
export interface PixelSprite {
  rows: string[]
  palette: Record<string, string>
}

/** One path per color, so the SVG stays small even with larger sprites. */
export function spritePaths(sprite: PixelSprite): { key: string; color: string; d: string }[] {
  return Object.entries(sprite.palette).map(([key, color]) => ({
    key,
    color,
    d: pixelPath(sprite.rows, key),
  }))
}
