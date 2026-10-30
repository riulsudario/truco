import { describe, expect, it } from 'vitest'
import { cardId, cardPower, cleanDeck, manilhaFor, RANKS } from '../src'
import { c } from './fixtures'

describe('clean deck', () => {
  it('has 24 distinct cards, only Q J K A 2 3', () => {
    const deck = cleanDeck()
    expect(deck).toHaveLength(24)
    expect(new Set(deck.map(cardId)).size).toBe(24)
    expect(new Set(deck.map((card) => card.rank))).toEqual(new Set(['Q', 'J', 'K', 'A', '2', '3']))
  })
})

describe('manilha', () => {
  it.each([
    ['Qd', 'J'],
    ['Jd', 'K'],
    ['Kd', 'A'],
    ['Ad', '2'],
    ['2d', '3'],
    ['3d', 'Q'],
  ])('vira %s faz manilha %s', (vira, manilha) => {
    expect(manilhaFor(c(vira))).toBe(manilha)
  })
})

describe('card strength', () => {
  // Vira K: the manilha is the ace, so the order is zap > hearts > spades > diamonds > 3 > 2 > K > J > Q.
  const manilha = manilhaFor(c('Kd'))
  const ordered = ['Ac', 'Ah', 'As', 'Ad', '3d', '2d', 'Kd', 'Jd', 'Qd']

  it('follows the Paulista order with manilhas by suit', () => {
    const powers = ordered.map((code) => cardPower(c(code), manilha))
    expect([...powers].sort((a, b) => b - a)).toEqual(powers)
    expect(new Set(powers).size).toBe(ordered.length)
  })

  it('regular cards of the same rank tie across suits', () => {
    expect(cardPower(c('3c'), manilha)).toBe(cardPower(c('3d'), manilha))
  })

  it('without manilha, follows 3 > 2 > A > K > J > Q', () => {
    const powers = [...RANKS].reverse().map((rank) => cardPower({ rank, suit: 'hearts' }, 'Q'))
    expect(powers.slice(0, -1)).toEqual([...powers.slice(0, -1)].sort((a, b) => b - a))
  })
})
