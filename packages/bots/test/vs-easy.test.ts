import { expect, it } from 'vitest'
import { winRate } from './simulate'

it('normal bot beats the easy one most of the time', () => {
  expect(winRate(['normal', 'easy', 'normal', 'easy'], 400)).toBeGreaterThan(0.6)
})
