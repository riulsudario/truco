import {
  manilhaFor,
  newGame,
  toPlayerView,
  type Card,
  type GameState,
  type Rank,
  type Suit,
} from '@truco/engine'
import { describe, expect, it } from 'vitest'
import { decide } from '../src'

const SUITS: Record<string, Suit> = { d: 'diamonds', s: 'spades', h: 'hearts', c: 'clubs' }
const c = (code: string): Card => ({
  rank: code.slice(0, -1) as Rank,
  suit: SUITS[code.slice(-1)]!,
})
const never = () => 0.99

/** Hand with a K vira (A manilha). Seat 1 leads; plays are the cards already played in the round. */
function scenario(myCards: string[], plays: [number, string][], turn: 0 | 1 | 2 | 3): GameState {
  const state = newGame({ seed: 1 })
  state.hand.vira = c('Kd')
  state.hand.manilha = manilhaFor(c('Kd'))
  state.hand.cards[turn] = myCards.map(c)
  state.hand.rounds = [
    {
      plays: plays.map(([seat, code]) => ({ seat: seat as 0, card: c(code), hidden: false })),
      result: null,
    },
  ]
  state.hand.turn = turn
  return state
}

const choose = (state: GameState, seat: 0 | 1 | 2 | 3) =>
  decide({ view: toPlayerView(state, seat), random: never })

/** The easy bot's greedy rule, with truco locked to isolate the card choice. */
const chooseCard = (state: GameState, seat: 0 | 1 | 2 | 3) => {
  state.hand.raisedBy = (seat % 2) as 0 | 1
  return decide({ view: toPlayerView(state, seat), random: never, difficulty: 'easy' })
}

describe('card choice', () => {
  it('discards the lowest when the partner is already winning the round and it plays last', () => {
    const state = scenario(
      ['3s', 'Qd', 'Ah'],
      [
        [1, 'Jd'],
        [2, '2c'],
        [3, 'Ks'],
      ],
      0,
    )
    expect(chooseCard(state, 0)).toEqual({ type: 'play', seat: 0, index: 1 })
  })

  it('wins with the lowest card that does', () => {
    const state = scenario(['Ah', '3s', 'Qd'], [[1, '2d']], 2)
    expect(chooseCard(state, 2)).toEqual({ type: 'play', seat: 2, index: 1 })
  })

  it('leads the hand while saving the manilhas', () => {
    const state = scenario(['Ac', '3s', 'Qd'], [], 1)
    expect(chooseCard(state, 1)).toEqual({ type: 'play', seat: 1, index: 1 })
  })

  it('throws away the lowest when it cannot win', () => {
    const state = scenario(['Jd', 'Qs', 'Kd'], [[1, 'Ac']], 2)
    expect(chooseCard(state, 2)).toEqual({ type: 'play', seat: 2, index: 1 })
  })
})

describe('truco', () => {
  it('calls with a strong hand', () => {
    const state = scenario(['Ac', 'Ah', '3s'], [], 1)
    expect(choose(state, 1)).toEqual({ type: 'truco', seat: 1 })
  })

  it('runs from truco with a weak hand', () => {
    const state = scenario(['Qd', 'Jd', 'Qs'], [], 1)
    state.hand.truco = { team: 0, caller: 0, stake: 3, runVotes: [] }
    expect(choose(state, 1)).toEqual({ type: 'run', seat: 1 })
  })

  it('accepts when running would already give away the game', () => {
    const state = scenario(['Qd', 'Jd', 'Qs'], [], 1)
    state.scores = [11, 3]
    state.hand.kind = 'normal'
    state.hand.truco = { team: 0, caller: 0, stake: 3, runVotes: [] }
    expect(choose(state, 1)).toEqual({ type: 'accept', seat: 1 })
  })
})
