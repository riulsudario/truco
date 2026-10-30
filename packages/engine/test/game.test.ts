import { describe, expect, it } from 'vitest'
import { cardId, newGame, reduce, seatsToAct, toPlayerView, type GameState } from '../src'
import { play, run, stateWith } from './fixtures'

// Vira K → manilha A. Seat 1 starts (the dealer is seat 0).
const strongTeam0 = stateWith({
  vira: 'Kd',
  cards: [
    ['Qd', '3c', '3h'],
    ['Qs', 'Jd', 'Js'],
    ['2c', '2h', 'Qh'],
    ['Ks', 'Jh', 'Kh'],
  ],
})

/** A full round, everyone always playing their first card, starting with seat 1. */
const roundFrom1 = [play(1), play(2), play(3), play(0)]

describe('new game', () => {
  it('deals 3 cards per seat plus the vira, without repeats', () => {
    const state = newGame({ seed: 42 })
    const all = [...state.hand.cards.flat(), state.hand.vira].map(cardId)
    expect(state.hand.cards.map((cards) => cards.length)).toEqual([3, 3, 3, 3])
    expect(new Set(all).size).toBe(13)
    expect(state.hand.turn).toBe(1)
  })

  it('is deterministic by seed', () => {
    expect(newGame({ seed: 7 })).toEqual(newGame({ seed: 7 }))
    expect(newGame({ seed: 7 }).hand.cards).not.toEqual(newGame({ seed: 8 }).hand.cards)
  })
})

describe('turns and rounds', () => {
  it('rejects an out-of-turn play without changing the state', () => {
    const before = structuredClone(strongTeam0)
    expect(reduce(strongTeam0, play(2))).toEqual({ ok: false, error: 'not_your_turn' })
    expect(strongTeam0).toEqual(before)
  })

  it('rejects an invalid card index', () => {
    expect(reduce(strongTeam0, play(1, 3))).toEqual({ ok: false, error: 'invalid_card' })
  })

  it('the round winner starts the next one', () => {
    // 2c (seat 2) wins the first round.
    const { state } = run(strongTeam0, ...roundFrom1)
    expect(state.hand.rounds[0]!.result).toBe(0)
    expect(state.hand.turn).toBe(2)
  })

  it('the team that takes two rounds wins the hand worth 1', () => {
    const { state, events } = run(strongTeam0, ...roundFrom1, play(2), play(3), play(0), play(1))
    expect(state.phase).toBe('handOver')
    expect(state.scores).toEqual([1, 0])
    expect(events.at(-1)).toMatchObject({ type: 'handEnded', result: { winner: 0, points: 1 } })
  })

  it('the next hand rotates the dealer and who starts', () => {
    const { state } = run(strongTeam0, ...roundFrom1, play(2), play(3), play(0), play(1), {
      type: 'nextHand',
    })
    expect(state.phase).toBe('playing')
    expect(state.hand.dealer).toBe(1)
    expect(state.hand.turn).toBe(2)
    expect(state.hand.number).toBe(2)
  })

  it('face-down cards only from the second round on', () => {
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
  it('an accepted call is worth 3', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 }, { type: 'accept', seat: 0 })
    expect(state.hand.stake).toBe(3)
    expect(state.hand.raisedBy).toBe(1)
  })

  it('can only call on your own turn', () => {
    expect(reduce(strongTeam0, { type: 'truco', seat: 3 })).toEqual({
      ok: false,
      error: 'not_your_turn',
    })
  })

  it('the calling team neither responds nor plays while truco is pending', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 })
    expect(reduce(state, { type: 'accept', seat: 3 })).toEqual({
      ok: false,
      error: 'not_your_team',
    })
    expect(reduce(state, play(1))).toEqual({ ok: false, error: 'truco_pending' })
  })

  it('whoever raised cannot raise again right away', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 }, { type: 'accept', seat: 2 })
    expect(reduce(state, { type: 'truco', seat: 1 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
  })

  it('the other team can call six on its turn', () => {
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

  it('running gives the other team the current stake', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'run', seat: 0 },
      { type: 'run', seat: 2 },
    )
    expect(state.scores).toEqual([0, 1])
    expect(state.lastHand).toEqual({ winner: 1, points: 1, reason: 'ran' })
  })

  it('nobody raises while answering a call: six only on your turn', () => {
    const { state } = run(strongTeam0, { type: 'truco', seat: 1 })
    expect(reduce(state, { type: 'truco', seat: 0 })).toEqual({
      ok: false,
      error: 'truco_pending',
    })
    const voted = run(state, { type: 'run', seat: 0 }).state
    expect(reduce(voted, { type: 'truco', seat: 2 })).toEqual({
      ok: false,
      error: 'truco_pending',
    })
  })

  it('one partner wanting to run is not enough: the other still decides', () => {
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

  it('one partner accepting is enough, even if the other wanted to run', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'run', seat: 0 },
      { type: 'accept', seat: 2 },
    )
    expect(state.hand.stake).toBe(3)
    expect(state.hand.truco).toBeNull()
  })

  it('stops at twelve', () => {
    const { state } = run(
      strongTeam0,
      { type: 'truco', seat: 1 },
      { type: 'accept', seat: 2 },
      play(1),
      { type: 'truco', seat: 2 },
      { type: 'accept', seat: 3 },
      play(2),
      { type: 'truco', seat: 3 },
      { type: 'accept', seat: 0 },
      play(3),
      { type: 'truco', seat: 0 },
    )
    expect(state.hand.truco?.stake).toBe(12)
    // Seat 2 won the round and leads, but its team already raised to twelve: nothing left.
    const accepted = run(state, { type: 'accept', seat: 1 }, play(0)).state
    expect(accepted.hand.stake).toBe(12)
    expect(reduce(accepted, { type: 'truco', seat: 2 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
  })
})

describe('hand of eleven', () => {
  const eleven = stateWith({ ...strongTeam0Setup(), scores: [11, 4] })

  it('is worth 3 and waits for the team at 11 to decide', () => {
    expect(eleven.hand.kind).toBe('eleven')
    expect(eleven.hand.stake).toBe(3)
    expect(reduce(eleven, play(1))).toEqual({ ok: false, error: 'eleven_pending' })
    expect(reduce(eleven, { type: 'eleven', seat: 1, accept: true })).toEqual({
      ok: false,
      error: 'not_your_team',
    })
  })

  it("the team at 11 sees the partner's cards; the opponents do not", () => {
    expect(toPlayerView(eleven, 0).hand.partnerCards).toEqual(eleven.hand.cards[2])
    expect(toPlayerView(eleven, 1).hand.partnerCards).toBeNull()
  })

  it('running from the hand of eleven gives 1 to the opponents', () => {
    const { state } = run(eleven, { type: 'eleven', seat: 2, accept: false })
    expect(state.scores).toEqual([11, 5])
  })

  it('when played, there is no truco and it is worth 3', () => {
    const { state } = run(eleven, { type: 'eleven', seat: 0, accept: true })
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

describe('iron hand', () => {
  const iron = stateWith({ ...strongTeam0Setup(), scores: [11, 11] })

  it('is played blind, without truco or face-down cards', () => {
    expect(iron.hand.kind).toBe('iron')
    expect(toPlayerView(iron, 1).hand.myCards).toEqual([null, null, null])
    expect(reduce(iron, { type: 'truco', seat: 1 })).toEqual({
      ok: false,
      error: 'truco_not_allowed',
    })
    const second = run(iron, ...roundFrom1).state
    expect(reduce(second, play(2, 0, true))).toEqual({ ok: false, error: 'hidden_not_allowed' })
  })
})

describe('game over', () => {
  it('accepts no more actions and caps the score at 12', () => {
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
    vira: 'Kd',
    cards: [
      ['Qd', '3c', '3h'],
      ['Qs', 'Jd', 'Js'],
      ['2c', '2h', 'Qh'],
      ['Ks', 'Jh', 'Kh'],
    ] as [string[], string[], string[], string[]],
  }
}
