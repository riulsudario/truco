import type { Suit } from '@truco/engine'

/** Naipes desenhados pixel a pixel (7×7), para não depender de fonte com os símbolos. */
export const SUIT_PIXELS: Record<Suit, string[]> = {
  ouros: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  copas: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  espadas: ['...#...', '..###..', '.#####.', '#######', '#######', '...#...', '..###..'],
  paus: ['..###..', '..###..', '#######', '#######', '##.#.##', '...#...', '..###..'],
}

/** Converte o bitmap num path SVG com um quadrado por pixel igual a `on`. */
export function pixelPath(rows: string[], on = '#'): string {
  return rows
    .flatMap((row, y) => [...row].map((cell, x) => (cell === on ? `M${x} ${y}h1v1h-1z` : '')))
    .join('')
}

export const isRed = (suit: Suit) => suit === 'ouros' || suit === 'copas'

/** Bitmap colorido: cada caractere é uma cor da paleta; '.' é transparente. */
export interface PixelSprite {
  rows: string[]
  palette: Record<string, string>
}

/** Um path por cor, para o SVG ficar pequeno mesmo com sprites maiores. */
export function spritePaths(sprite: PixelSprite): { key: string; color: string; d: string }[] {
  return Object.entries(sprite.palette).map(([key, color]) => ({
    key,
    color,
    d: pixelPath(sprite.rows, key),
  }))
}
