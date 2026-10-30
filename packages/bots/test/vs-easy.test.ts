import { expect, it } from 'vitest'
import { winRate } from './simulate'

it('bot normal ganha do fácil na maioria', () => {
  expect(winRate(['normal', 'facil', 'normal', 'facil'], 400)).toBeGreaterThan(0.6)
})
