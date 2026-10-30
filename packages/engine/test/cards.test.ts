import { describe, expect, it } from 'vitest'
import { cardId, cardPower, cleanDeck, manilhaFor, RANKS } from '../src'
import { c } from './fixtures'

describe('baralho limpo', () => {
  it('tem 24 cartas distintas, só Q J K A 2 3', () => {
    const deck = cleanDeck()
    expect(deck).toHaveLength(24)
    expect(new Set(deck.map(cardId)).size).toBe(24)
    expect(new Set(deck.map((card) => card.rank))).toEqual(new Set(['Q', 'J', 'K', 'A', '2', '3']))
  })
})

describe('manilha', () => {
  it.each([
    ['Qo', 'J'],
    ['Jo', 'K'],
    ['Ko', 'A'],
    ['Ao', '2'],
    ['2o', '3'],
    ['3o', 'Q'],
  ])('vira %s faz manilha %s', (vira, manilha) => {
    expect(manilhaFor(c(vira))).toBe(manilha)
  })
})

describe('força das cartas', () => {
  // Vira K: a manilha é o ás, então a ordem fica zap > copas > espadas > ouros > 3 > 2 > K > J > Q.
  const manilha = manilhaFor(c('Ko'))
  const ordered = ['Ap', 'Ac', 'Ae', 'Ao', '3o', '2o', 'Ko', 'Jo', 'Qo']

  it('segue a ordem paulista com as manilhas por naipe', () => {
    const powers = ordered.map((code) => cardPower(c(code), manilha))
    expect([...powers].sort((a, b) => b - a)).toEqual(powers)
    expect(new Set(powers).size).toBe(ordered.length)
  })

  it('cartas comuns do mesmo rank empatam entre naipes', () => {
    expect(cardPower(c('3p'), manilha)).toBe(cardPower(c('3o'), manilha))
  })

  it('sem manilha, segue 3 > 2 > A > K > J > Q', () => {
    const powers = [...RANKS].reverse().map((rank) => cardPower({ rank, suit: 'copas' }, 'Q'))
    expect(powers.slice(0, -1)).toEqual([...powers.slice(0, -1)].sort((a, b) => b - a))
  })
})
