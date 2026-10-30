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

const SUIT_BY_LETTER: Record<string, Suit> = { d: 'diamonds', s: 'spades', h: 'hearts', c: 'clubs' }

/** Card shorthand: c('3c') is the 3 of clubs, c('Qd') the queen of diamonds. */
export function c(code: string): Card {
  const suit = SUIT_BY_LETTER[code.slice(-1)]
  if (!suit) throw new Error(`invalid suit in ${code}`)
  return { rank: code.slice(0, -1) as Rank, suit }
}

interface HandSetup {
  vira: string
  /** Cards per seat, in order 0..3. */
  cards: [string[], string[], string[], string[]]
  scores?: [number, number]
  turn?: Seat
}

/** State at the start of a hand with hand-picked cards. */
export function stateWith({ vira, cards, scores, turn = 1 }: HandSetup): GameState {
  const base = newGame({ seed: 1 })
  if (scores) {
    base.scores = scores
  }
  const viraCard = c(vira)
  const atEleven = base.scores.filter((s) => s === 11).length
  const kind = atEleven === 2 ? 'iron' : atEleven === 1 ? 'eleven' : 'normal'
  base.hand = {
    ...base.hand,
    vira: viraCard,
    manilha: manilhaFor(viraCard),
    cards: cards.map((seatCards) => seatCards.map(c)),
    turn,
    kind,
    stake: kind === 'eleven' ? 3 : 1,
    elevenPending: kind === 'eleven' ? (base.scores[0] === 11 ? 0 : 1) : null,
  }
  return base
}

/** Applies actions in sequence and fails the test if any is illegal. */
export function run(
  state: GameState,
  ...actions: Action[]
): { state: GameState; events: GameEvent[] } {
  let current = state
  const events: GameEvent[] = []
  for (const action of actions) {
    const result = reduce(current, action)
    if (!result.ok) throw new Error(`${JSON.stringify(action)} failed: ${result.error}`)
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
