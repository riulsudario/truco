import { describe, expect, it } from 'vitest'
import { cardId, newGame, reduce, seatsToAct, toPlayerView, type GameState } from '../src'
import { play, run, stateWith } from './fixtures'

// Vira K → manilha A. Cadeira 1 começa (o dealer é a 0).
const strongTeam0 = stateWith({
  vira: 'Ko',
  cards: [
    ['Qo', '3p', '3c'],
    ['Qe', 'Jo', 'Je'],
    ['2p', '2c', 'Qc'],
    ['Ke', 'Jc', 'Kc'],
  ],
})

/** Uma vaza completa jogando sempre a primeira carta de cada um, começando pela cadeira 1. */
const roundFrom1 = [play(1), play(2), play(3), play(0)]

describe('nova partida', () => {
  it('dá 3 cartas por cadeira mais a vira, sem repetir', () => {
    const state = newGame({ seed: 42 })
    const all = [...state.hand.cards.flat(), state.hand.vira].map(cardId)
    expect(state.hand.cards.map((cards) => cards.length)).toEqual([3, 3, 3, 3])
    expect(new Set(all).size).toBe(13)
    expect(state.hand.turn).toBe(1)
  })

  it('é determinística pela seed', () => {
    expect(newGame({ seed: 7 })).toEqual(newGame({ seed: 7 }))
    expect(newGame({ seed: 7 }).hand.cards).not.toEqual(newGame({ seed: 8 }).hand.cards)
  })
})

describe('vez e vazas', () => {
  it('recusa jogada fora da vez sem alterar o estado', () => {
    const before = structuredClone(strongTeam0)
    expect(reduce(strongTeam0, play(2))).toEqual({ ok: false, error: 'not_your_turn' })
    expect(strongTeam0).toEqual(before)
  })

  it('recusa índice de carta inválido', () => {
    expect(reduce(strongTeam0, play(1, 3))).toEqual({ ok: false, error: 'invalid_card' })
  })

  it('quem ganha a vaza começa a próxima', () => {
    // 2p (cadeira 2) ganha a primeira vaza.
    const { state } = run(strongTeam0, ...roundFrom1)
    expect(state.hand.rounds[0]!.result).toBe(0)
    expect(state.hand.turn).toBe(2)
  })

  it('time que faz duas vazas leva a mão valendo 1', () => {
    const { state, events } = run(strongTeam0, ...roundFrom1, play(2), play(3), play(0), play(1))
    expect(state.phase).toBe('handOver')
    expect(state.scores).toEqual([1, 0])
    expect(events.at(-1)).toMatchObject({ type: 'handEnded', result: { winner: 0, points: 1 } })
  })

  it('próxima mão roda o dealer e quem começa', () => {
    const { state } = run(strongTeam0, ...roundFrom1, play(2), play(3), play(0), play(1), {
      type: 'nextHand',
    })
    expect(state.phase).toBe('playing')
    expect(state.hand.dealer).toBe(1)
    expect(state.hand.turn).toBe(2)
    expect(state.hand.number).toBe(2)
  })

  it('carta encoberta só a partir da segunda vaza', () => {
    expect(reduce(strongTeam0, play(1, 0, true))).toEqual({
      ok: false,
      error: 'hidden_not_allowed',
    })
    const { state, events } = run(strongTeam0, ...roundFrom1, play(2, 0, true))
    expect(events.at(-1)).toEqual({ type: 'cardPlayed', seat: 2, card: null })
    expect(state.hand.rounds[1]!.plays[0]!.hidden).toBe(true)
  })
})

describe('truco', () => {
  it('pedido aceito passa a valer 3', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 }, { type: 'accept', seat: 0 })
    expect(state.hand.stake).toBe(3)
    expect(state.hand.raisedBy).toBe(1)
  })

  it('só pede na própria vez', () => {
    expect(reduce(strongTeam0, { type: 'truco', seat: 3 })).toEqual({
      ok: false,
      error: 'not_your_turn',
    })
  })

  it('o próprio time não responde nem joga com truco pendente', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 })
    expect(reduce(state, { type: 'accept', seat: 3 })).toEqual({
      ok: false,
      error: 'not_your_team',
    })
    expect(reduce(state, play(1))).toEqual({ ok: false, error: 'truco_pending' })
  })

  it('quem aumentou não aumenta de novo em seguida', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 }, { type: 'accept', seat: 2 })
    expect(reduce(state, { type: 'truco', seat: 1 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
  })

  it('o outro time pode pedir seis na vez dele', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'accept', seat: 2 },
      play(1),
      {
        type: 'truco',
        seat: 2,
      },
    )
    expect(state.hand.truco).toEqual({ team: 0, caller: 2, stake: 6, runVotes: [] })
  })

  it('correr dá ao outro time o valor que estava valendo', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'run', seat: 0 },
      { type: 'run', seat: 2 },
    )
    expect(state.scores).toEqual([0, 1])
    expect(state.lastHand).toEqual({ winner: 1, points: 1, reason: 'ran' })
  })

  it('aumentar em resposta aceita o truco; correr depois dá 3', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'truco', seat: 0 },
      { type: 'run', seat: 3 },
      { type: 'run', seat: 1 },
    )
    expect(state.scores).toEqual([3, 0])
  })

  it('um só querendo correr não basta: o parceiro ainda decide', () => {
    const { state, events } = run(strongTeam0, { type: 'truco', seat: 1 }, { type: 'run', seat: 0 })
    expect(state.phase).toBe('playing')
    expect(events.at(-1)).toEqual({ type: 'runVoted', seat: 0 })
    expect(state.hand.truco?.runVotes).toEqual([0])
    expect(seatsToAct(state)).toEqual([2])
    expect(reduce(state, { type: 'run', seat: 0 })).toEqual({ ok: false, error: 'already_voted' })
    expect(reduce(state, { type: 'accept', seat: 0 })).toEqual({
      ok: false,
      error: 'already_voted',
    })
  })

  it('basta um da dupla descer, mesmo que o outro quisesse correr', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'run', seat: 0 },
      { type: 'accept', seat: 2 },
    )
    expect(state.hand.stake).toBe(3)
    expect(state.hand.truco).toBeNull()
  })

  it('o parceiro pode aumentar depois que o outro quis correr', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'run', seat: 0 },
      { type: 'truco', seat: 2 },
    )
    expect(state.hand.truco).toEqual({ team: 0, caller: 2, stake: 6, runVotes: [] })
  })

  it('para no doze', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'truco', seat: 0 },
      { type: 'truco', seat: 1 },
      { type: 'truco', seat: 2 },
    )
    expect(state.hand.truco?.stake).toBe(12)
    expect(reduce(state, { type: 'truco', seat: 3 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
    const accepted = run(state, { type: 'accept', seat: 1 }, play(1)).state
    expect(reduce(accepted, { type: 'truco', seat: 2 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
  })
})

describe('mão de onze', () => {
  const onze = stateWith({ ...strongTeam0Setup(), scores: [11, 4] })

  it('vale 3 e espera a decisão do time com 11', () => {
    expect(onze.hand.kind).toBe('onze')
    expect(onze.hand.stake).toBe(3)
    expect(reduce(onze, play(1))).toEqual({ ok: false, error: 'onze_pending' })
    expect(reduce(onze, { type: 'onze', seat: 1, accept: true })).toEqual({
      ok: false,
      error: 'not_your_team',
    })
  })

  it('o time com 11 vê as cartas do parceiro; o adversário não', () => {
    expect(toPlayerView(onze, 0).hand.partnerCards).toEqual(onze.hand.cards[2])
    expect(toPlayerView(onze, 1).hand.partnerCards).toBeNull()
  })

  it('correr da mão de onze dá 1 ao adversário', () => {
    const { state } = run(onze, { type: 'onze', seat: 2, accept: false })
    expect(state.scores).toEqual([11, 5])
  })

  it('jogando, não tem truco e vale 3', () => {
    const { state } = run(onze, { type: 'onze', seat: 0, accept: true })
    expect(reduce(state, { type: 'truco', seat: 1 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
    const end = run(state, ...roundFrom1, play(2), play(3), play(0), play(1)).state
    expect(end.phase).toBe('gameOver')
    expect(end.scores).toEqual([12, 4])
    expect(end.winner).toBe(0)
  })
})

describe('mão de ferro', () => {
  const ferro = stateWith({ ...strongTeam0Setup(), scores: [11, 11] })

  it('é jogada às cegas, sem truco e sem carta encoberta', () => {
    expect(ferro.hand.kind).toBe('ferro')
    expect(toPlayerView(ferro, 1).hand.myCards).toEqual([null, null, null])
    expect(reduce(ferro, { type: 'truco', seat: 1 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
    const second = run(ferro, ...roundFrom1).state
    expect(reduce(second, play(2, 0, true))).toEqual({ ok: false, error: 'hidden_not_allowed' })
  })
})

describe('fim de jogo', () => {
  it('não aceita mais ações e trava o placar em 12', () => {
    const near: GameState = stateWith({ ...strongTeam0Setup(), scores: [10, 0] })
    const { state } = run(
      near,
      { type: 'truco', seat: 1 },
      { type: 'run', seat: 0 },
      { type: 'run', seat: 2 },
    )
    expect(state.phase).toBe('handOver')
    const big = run(
      near,
      { type: 'truco', seat: 1 },
      { type: 'accept', seat: 0 },
      ...roundFrom1,
      play(2),
      play(3),
      play(0),
      play(1),
    ).state
    expect(big.scores).toEqual([12, 0])
    expect(reduce(big, { type: 'nextHand' })).toEqual({ ok: false, error: 'game_over' })
  })
})

function strongTeam0Setup() {
  return {
    vira: 'Ko',
    cards: [
      ['Qo', '3p', '3c'],
      ['Qe', 'Jo', 'Je'],
      ['2p', '2c', 'Qc'],
      ['Ke', 'Jc', 'Kc'],
    ] as [string[], string[], string[], string[]],
  }
}
