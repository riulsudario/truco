import { describe, expect, it } from 'vitest'
import { simulate, winRate } from './simulate'

describe('simulation', () => {
  it('150 bot × bot games without a single illegal move', () => {
    for (let seed = 1; seed <= 150; seed++) {
      expect([0, 1]).toContain(simulate(['normal', 'normal', 'normal', 'normal'], seed))
    }
  })

  it('normal bot beats a random player', () => {
    expect(winRate(['normal', 'random', 'normal', 'random'], 300)).toBeGreaterThan(0.8)
  })
})
