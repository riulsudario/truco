import { describe, expect, it } from 'vitest'
import { handWinner, roundOutcome, type RoundResult, type Seat } from '../src'
import { c } from './fixtures'

describe('handWinner (regras de empate)', () => {
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

  it('maior carta vence e lidera a próxima vaza', () => {
    const round = {
      plays: [play(1, 'Ko'), play(2, '3e'), play(3, 'Qc'), play(0, '2p')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 0, leader: 2 })
  })

  it('empate entre times diferentes canga', () => {
    const round = {
      plays: [play(1, '3o'), play(2, '3e'), play(3, 'Qc'), play(0, '2p')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 'tie', leader: 1 })
  })

  it('empate entre parceiros não canga', () => {
    const round = {
      plays: [play(1, '3o'), play(2, 'Qe'), play(3, '3c'), play(0, '2p')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 1, leader: 1 })
  })

  it('carta encoberta não ganha', () => {
    const round = {
      plays: [play(1, 'Ap', true), play(2, 'Qe'), play(3, 'Jc'), play(0, 'Ko')],
      result: null,
    }
    expect(roundOutcome(round, hand)).toEqual({ result: 0, leader: 0 })
  })
})
