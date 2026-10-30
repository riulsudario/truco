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

const SUITS: Record<string, Suit> = { o: 'ouros', e: 'espadas', c: 'copas', p: 'paus' }
const c = (code: string): Card => ({
  rank: code.slice(0, -1) as Rank,
  suit: SUITS[code.slice(-1)]!,
})
const never = () => 0.99

/** Mão com vira K (manilha A). Cadeira 1 começa; plays são as cartas já jogadas na vaza. */
function scenario(myCards: string[], plays: [number, string][], turn: 0 | 1 | 2 | 3): GameState {
  const state = newGame({ seed: 1 })
  state.hand.vira = c('Ko')
  state.hand.manilha = manilhaFor(c('Ko'))
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

/** Regra gulosa do bot fácil, com o truco travado para isolar a escolha da carta. */
const chooseCard = (state: GameState, seat: 0 | 1 | 2 | 3) => {
  state.hand.raisedBy = (seat % 2) as 0 | 1
  return decide({ view: toPlayerView(state, seat), random: never, difficulty: 'facil' })
}

describe('escolha de carta', () => {
  it('descarta a menor quando o parceiro já ganha a vaza e ele é o último', () => {
    const state = scenario(
      ['3e', 'Qo', 'Ac'],
      [
        [1, 'Jo'],
        [2, '2p'],
        [3, 'Ke'],
      ],
      0,
    )
    expect(chooseCard(state, 0)).toEqual({ type: 'play', seat: 0, index: 1 })
  })

  it('ganha com a menor carta que serve', () => {
    const state = scenario(['Ac', '3e', 'Qo'], [[1, '2o']], 2)
    expect(chooseCard(state, 2)).toEqual({ type: 'play', seat: 2, index: 1 })
  })

  it('abre a mão guardando as manilhas', () => {
    const state = scenario(['Ap', '3e', 'Qo'], [], 1)
    expect(chooseCard(state, 1)).toEqual({ type: 'play', seat: 1, index: 1 })
  })

  it('quando não ganha, joga fora a menor', () => {
    const state = scenario(['Jo', 'Qe', 'Ko'], [[1, 'Ap']], 2)
    expect(chooseCard(state, 2)).toEqual({ type: 'play', seat: 2, index: 1 })
  })
})

describe('truco', () => {
  it('pede com mão forte', () => {
    const state = scenario(['Ap', 'Ac', '3e'], [], 1)
    expect(choose(state, 1)).toEqual({ type: 'truco', seat: 1 })
  })

  it('corre de truco com mão fraca', () => {
    const state = scenario(['Qo', 'Jo', 'Qe'], [], 1)
    state.hand.truco = { team: 0, caller: 0, stake: 3, runVotes: [] }
    expect(choose(state, 1)).toEqual({ type: 'run', seat: 1 })
  })

  it('aceita quando correr já entregaria o jogo', () => {
    const state = scenario(['Qo', 'Jo', 'Qe'], [], 1)
    state.scores = [11, 3]
    state.hand.kind = 'normal'
    state.hand.truco = { team: 0, caller: 0, stake: 3, runVotes: [] }
    expect(choose(state, 1)).toEqual({ type: 'accept', seat: 1 })
  })
})
