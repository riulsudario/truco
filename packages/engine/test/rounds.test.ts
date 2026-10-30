import { describe, expect, it } from 'vitest'
import { handWinner, roundOutcome, type RoundResult, type Seat } from '../src'
import { c } from './fixtures'

describe('handWinner (tie rules)', () => {
  it.each<[RoundResult[], 0 | 1 | null | undefined]>([
    [[0], undefined],
    [[0, 0], 0],
    [[0, 1], undefined],
    [[0, 1, 0], 0],
    [[0, 1, 1], 1],
    [['tie', 1], 1],
    [[1, 'tie'], 1],
    [['tie', 'tie'], undefined],
    [['tie', 'tie', 0], 0],
    [[0, 1, 'tie'], 0],
    [['tie', 'tie', 'tie'], null],
  ])('%j → %s', (results, expected) => {
    expect(handWinner(results)).toBe(expected)
  })
})

describe('roundOutcome', () => {
  const play = (seat: Seat, code: string, hidden = false) => ({ seat, card: c(code), hidden })
  const hand = { manilha: 'A' as const }

  it('highest card wins and leads the next round', () => {
    const round = {
      plays: [play(1, 'Kd'), play(2, '3s'), play(3, 'Qh'), play(0, '2c')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 0, leader: 2 })
  })

  it('a tie between different teams is a cangada', () => {
    const round = {
      plays: [play(1, '3d'), play(2, '3s'), play(3, 'Qh'), play(0, '2c')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 'tie', leader: 1 })
  })

  it('a tie between partners is not a cangada', () => {
    const round = {
      plays: [play(1, '3d'), play(2, 'Qs'), play(3, '3h'), play(0, '2c')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 1, leader: 1 })
  })

  it('a face-down card does not win', () => {
    const round = {
      plays: [play(1, 'Ac', true), play(2, 'Qs'), play(3, 'Jh'), play(0, 'Kd')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 0, leader: 0 })
  })
})
