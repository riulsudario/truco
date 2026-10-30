import type { GameEvent } from '@truco/engine'
import { describe, expect, it } from 'vitest'
import { tauntReaction } from '../src'

const always = () => 0
const never = () => 0.999

describe('bot taunts', () => {
  it('the truco caller does not taunt (it already shouts the line); its partner cheers', () => {
    const events: GameEvent[] = [{ type: 'trucoCalled', seat: 1, stake: 3 }]
    expect(tauntReaction(events, 1, always)).toBeNull()
    expect(tauntReaction(events, 3, always)).toBe('truco-thief')
    expect(tauntReaction(events, 3, never)).toBeNull()
  })

  it('mocks when an opponent runs, but not when its own team runs', () => {
    const events: GameEvent[] = [{ type: 'ran', seat: 0 }]
    expect(tauntReaction(events, 1, always)).toBe('scared')
    expect(tauntReaction(events, 2, always)).toBeNull()
  })

  it('reacts to the end of the game according to the result', () => {
    const events: GameEvent[] = [{ type: 'gameEnded', winner: 1 }]
    expect(tauntReaction(events, 3, always)).toBe('clap')
    expect(tauntReaction(events, 0, always)).toBe('robbed')
  })

  it('the most recent event in the batch takes priority', () => {
    const events: GameEvent[] = [
      { type: 'roundEnded', result: 'tie' },
      { type: 'gameEnded', winner: 0 },
    ]
    expect(tauntReaction(events, 0, always)).toBe('clap')
  })
})
