import { afterEach, expect, it } from 'vitest'
import { PROFILES } from '../src'
import { winRate } from './simulate'

const original = { ...PROFILES.easy }
afterEach(() => {
  PROFILES.easy = original
})

it('choosing cards by Monte Carlo beats the greedy rule', () => {
  PROFILES.easy = { ...PROFILES.normal, searchCards: false }
  expect(winRate(['normal', 'easy', 'normal', 'easy'], 400)).toBeGreaterThan(0.52)
})
