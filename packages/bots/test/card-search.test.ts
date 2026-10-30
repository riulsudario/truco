import { afterEach, expect, it } from 'vitest'
import { PROFILES } from '../src'
import { winRate } from './simulate'

const original = { ...PROFILES.facil }
afterEach(() => {
  PROFILES.facil = original
})

it('escolher carta por Monte Carlo ganha da regra gulosa', () => {
  PROFILES.facil = { ...PROFILES.normal, searchCards: false }
  expect(winRate(['normal', 'facil', 'normal', 'facil'], 400)).toBeGreaterThan(0.52)
})
