export const SUITS = ['diamonds', 'spades', 'hearts', 'clubs'] as const
export const RANKS = ['Q', 'J', 'K', 'A', '2', '3'] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]

export interface Card {
  readonly rank: Rank
  readonly suit: Suit
}

/** Hidden cards beat nothing. */
export const HIDDEN_POWER = -1

/** Clean deck (baralho limpo): Q, J, K, A, 2 and 3 of the four suits (24 cards). */
export function cleanDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit })))
}

/** The manilha is the rank after the vira, wrapping around: a 3 as vira makes the queen the manilha. */
export function manilhaFor(vira: Card): Rank {
  return RANKS[(RANKS.indexOf(vira.rank) + 1) % RANKS.length]!
}

/**
 * Card strength in the hand. Regular cards are worth 0 (Q) to 5 (3) and tie across suits;
 * manilhas are worth 10 (diamonds, pica-fumo) to 13 (clubs, zap).
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
