import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  cardId,
  createRandom,
  legalActions,
  newGame,
  reduce,
  SEATS,
  seatsToAct,
  toPlayerView,
  type Action,
  type GameState,
  type Seat,
} from '../src'

/** Plays a whole game picking legal actions at random. Returns every state. */
function randomGame(seed: number, maxSteps = 2000): GameState[] {
  const random = createRandom(seed ^ 0x9e3779b9)
  let state = newGame({ seed })
  const history = [state]
  for (let step = 0; step < maxSteps && state.phase !== 'gameOver'; step++) {
    const actions: Action[] =
      state.phase === 'handOver'
        ? [{ type: 'nextHand' }]
        : seatsToAct(state).flatMap((seat) => legalActions(state, seat))
    const action = actions[Math.floor(random() * actions.length)]!
    const result = reduce(state, action)
    if (!result.ok) throw new Error(`action listed as legal failed: ${result.error}`)
    state = result.state
    history.push(state)
  }
  return history
}

const seeds = fc.integer({ min: 0, max: 2 ** 31 - 1 })

describe('game properties', () => {
  it('every random game ends with a team at 12', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        const last = randomGame(seed).at(-1)!
        expect(last.phase).toBe('gameOver')
        expect(Math.max(...last.scores)).toBe(12)
      }),
      { numRuns: 200 },
    )
  })

  it('each hand uses 13 distinct cards from the clean deck, none lost or duplicated', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of randomGame(seed)) {
          const { hand } = state
          const inHands = hand.cards.flat()
          const played = hand.rounds.flatMap((round) => round.plays.map((p) => p.card))
          const ids = [...inHands, ...played, hand.vira].map(cardId)
          expect(ids).toHaveLength(13)
          expect(new Set(ids).size).toBe(13)
        }
      }),
      { numRuns: 100 },
    )
  })

  it("a seat's view never shows cards it should not see", () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        for (const state of randomGame(seed)) {
          for (const seat of [...SEATS, null] as (Seat | null)[]) {
            const view = toPlayerView(state, seat)
            const visible = new Set(
              [
                ...view.hand.myCards.filter((card) => card !== null),
                ...(view.hand.partnerCards ?? []),
              ].map(cardId),
            )
            const othersHands = state.hand.cards
              .flatMap((cards, owner) =>
                owner === seat || (view.hand.partnerCards && owner === (seat! + 2) % 4)
                  ? []
                  : cards,
              )
              .map(cardId)
            expect(othersHands.filter((id) => visible.has(id))).toEqual([])

            const leakedHidden = view.hand.rounds
              .flatMap((round) => round.plays)
              .filter((play) => play.hidden && play.seat !== seat && play.card !== null)
            expect(leakedHidden).toEqual([])
          }
        }
      }),
      { numRuns: 50 },
    )
  })

  it('actions outside the legal list are rejected without touching the state', () => {
    const anyAction = fc.oneof(
      fc.record({
        type: fc.constant('play' as const),
        seat: fc.constantFrom(...SEATS),
        index: fc.integer({ min: -1, max: 3 }),
        hidden: fc.boolean(),
      }),
      fc.record({
        type: fc.constantFrom('truco' as const, 'accept' as const, 'run' as const),
        seat: fc.constantFrom(...SEATS),
      }),
      fc.record({
        type: fc.constant('eleven' as const),
        seat: fc.constantFrom(...SEATS),
        accept: fc.boolean(),
      }),
    )
    fc.assert(
      fc.property(seeds, fc.nat(300), anyAction, (seed, stepIndex, action) => {
        const history = randomGame(seed)
        const state = history[stepIndex % history.length]!
        const legal = legalActions(state, action.seat).some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(action),
        )
        const before = structuredClone(state)
        const result = reduce(state, action)
        if (!legal && action.type === 'play' && !action.hidden) {
          // play with hidden false is the same as play without hidden in the legal list.
          const plain = legalActions(state, action.seat).some(
            (a) => a.type === 'play' && !a.hidden && a.index === action.index,
          )
          expect(result.ok).toBe(plain)
        } else {
          expect(result.ok).toBe(legal)
        }
        expect(state).toEqual(before)
      }),
      { numRuns: 300 },
    )
  })
})
