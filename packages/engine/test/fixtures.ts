import {
  manilhaFor,
  newGame,
  reduce,
  type Action,
  type Card,
  type GameEvent,
  type GameState,
  type Rank,
  type Seat,
  type Suit,
} from '../src'

const SUIT_BY_LETTER: Record<string, Suit> = { o: 'ouros', e: 'espadas', c: 'copas', p: 'paus' }

/** Atalho de carta: c('3p') é o 3 de paus, c('Qo') a dama de ouros. */
export function c(code: string): Card {
  const suit = SUIT_BY_LETTER[code.slice(-1)]
  if (!suit) throw new Error(`naipe inválido em ${code}`)
  return { rank: code.slice(0, -1) as Rank, suit }
}

interface HandSetup {
  vira: string
  /** Cartas por cadeira, na ordem 0..3. */
  cards: [string[], string[], string[], string[]]
  scores?: [number, number]
  turn?: Seat
}

/** Estado no início de uma mão com cartas escolhidas a dedo. */
export function stateWith({ vira, cards, scores, turn = 1 }: HandSetup): GameState {
  const base = newGame({ seed: 1 })
  if (scores) {
    base.scores = scores
  }
  const viraCard = c(vira)
  const atEleven = base.scores.filter((s) => s === 11).length
  const kind = atEleven === 2 ? 'ferro' : atEleven === 1 ? 'onze' : 'normal'
  base.hand = {
    ...base.hand,
    vira: viraCard,
    manilha: manilhaFor(viraCard),
    cards: cards.map((seatCards) => seatCards.map(c)),
    turn,
    kind,
    stake: kind === 'onze' ? 3 : 1,
    onzePending: kind === 'onze' ? (base.scores[0] === 11 ? 0 : 1) : null,
  }
  return base
}

/** Aplica ações em sequência e falha o teste se alguma for ilegal. */
export function run(
  state: GameState,
  ...actions: Action[]
): { state: GameState; events: GameEvent[] } {
  let current = state
  const events: GameEvent[] = []
  for (const action of actions) {
    const result = reduce(current, action)
    if (!result.ok) throw new Error(`${JSON.stringify(action)} falhou: ${result.error}`)
    current = result.state
    events.push(...result.events)
  }
  return { state: current, events }
}

export const play = (seat: Seat, index = 0, hidden = false): Action => ({
  type: 'play',
  seat,
  index,
  hidden,
})
