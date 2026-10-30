/** Provocações pré-definidas: o servidor só repassa o id, nunca texto livre. */
export const TAUNTS = [
  { id: 'truco-ladrao', kind: 'frase', text: 'Truco, ladrão!' },
  { id: 'pede-musica', kind: 'frase', text: 'Pede música!' },
  { id: 'medinho', kind: 'frase', text: 'Tá com medinho?' },
  { id: 'cangou', kind: 'frase', text: 'Cangou!' },
  { id: 'mao-de-alface', kind: 'frase', text: 'Mão de alface!' },
  { id: 'vai-chorar', kind: 'frase', text: 'Vai chorar?' },
  { id: 'tamo-junto', kind: 'frase', text: 'Tamo junto, parceiro!' },
  { id: 'fui-roubado', kind: 'frase', text: 'Fui roubado!' },
  { id: 'risada', kind: 'emoji', text: '😂' },
  { id: 'raiva', kind: 'emoji', text: '😡' },
  { id: 'choro', kind: 'emoji', text: '😭' },
  { id: 'fogo', kind: 'emoji', text: '🔥' },
  { id: 'coracao', kind: 'emoji', text: '❤️' },
  { id: 'caveira', kind: 'emoji', text: '💀' },
  { id: 'olhos', kind: 'emoji', text: '👀' },
  { id: 'palmas', kind: 'emoji', text: '👏' },
] as const

export type TauntId = (typeof TAUNTS)[number]['id']
export const TAUNT_IDS = TAUNTS.map((taunt) => taunt.id) as [TauntId, ...TauntId[]]
export const TAUNT_COOLDOWN_MS = 3000
