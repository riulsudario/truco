export const SUITS = ['ouros', 'espadas', 'copas', 'paus'] as const
export const RANKS = ['Q', 'J', 'K', 'A', '2', '3'] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]

export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}

/** Cartas encobertas não ganham de nada. */
export const HIDDEN_POWER = -1

/** Baralho limpo: Q, J, K, A, 2 e 3 dos quatro naipes (24 cartas). */
export function cleanDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))
}

/** A manilha é o rank seguinte ao da vira, em ciclo: vira 3 faz a dama virar manilha. */
export function manilhaFor(vira: Card): Rank {
  return RANKS[(RANKS.indexOf(vira.rank) + 1) % RANKS.length]!
}

/**
 * Força da carta na mão. Cartas comuns valem 0 (Q) a 5 (3) e empatam entre naipes;
 * manilhas valem 10 (ouros, pica-fumo) a 13 (paus, zap).
 */
export function cardPower(card: Card, manilha: Rank): number {
  if (card.rank === manilha) return 10 + SUITS.indexOf(card.suit)
  return RANKS.indexOf(card.rank)
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit
}

export function cardId(card: Card): string {
  return `${card.rank}-${card.suit}`
}
