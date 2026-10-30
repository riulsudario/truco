/** Predefined taunts: the server only relays the id, never free text. */
export const TAUNTS = [
  { id: 'truco-thief', kind: 'phrase', text: 'Truco, ladrão!' },
  { id: 'ask-for-music', kind: 'phrase', text: 'Pede música!' },
  { id: 'scared', kind: 'phrase', text: 'Tá com medinho?' },
  { id: 'tied', kind: 'phrase', text: 'Cangou!' },
  { id: 'butterfingers', kind: 'phrase', text: 'Mão de alface!' },
  { id: 'gonna-cry', kind: 'phrase', text: 'Vai chorar?' },
  { id: 'got-your-back', kind: 'phrase', text: 'Tamo junto, parceiro!' },
  { id: 'robbed', kind: 'phrase', text: 'Fui roubado!' },
  { id: 'laugh', kind: 'emoji', text: '😂' },
  { id: 'angry', kind: 'emoji', text: '😡' },
  { id: 'cry', kind: 'emoji', text: '😭' },
  { id: 'fire', kind: 'emoji', text: '🔥' },
  { id: 'heart', kind: 'emoji', text: '❤️' },
  { id: 'skull', kind: 'emoji', text: '💀' },
  { id: 'eyes', kind: 'emoji', text: '👀' },
  { id: 'clap', kind: 'emoji', text: '👏' },
] as const

export type TauntId = (typeof TAUNTS)[number]['id']
export const TAUNT_IDS = TAUNTS.map((taunt) => taunt.id) as [TauntId, ...TauntId[]]
export const TAUNT_COOLDOWN_MS = 3000
