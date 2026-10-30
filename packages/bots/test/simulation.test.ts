import { describe, expect, it } from 'vitest'
import { simulate, winRate } from './simulate'

describe('simulação', () => {
  it('150 partidas bot × bot sem nenhuma jogada ilegal', () => {
    for (let seed = 1; seed <= 150; seed++) {
      expect([0, 1]).toContain(simulate(['normal', 'normal', 'normal', 'normal'], seed))
    }
  })

  it('bot normal ganha de quem joga ao acaso', () => {
    expect(winRate(['normal', 'aleatorio', 'normal', 'aleatorio'], 300)).toBeGreaterThan(0.8)
  })
})
