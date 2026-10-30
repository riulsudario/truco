import { newGame, reduce } from '@truco/engine'
import { describe, expect, it } from 'vitest'
import { BOT_DECISION_DELAY_MS, BOT_PLAY_DELAY_MS, botDelay } from '../src'

describe('bot pace', () => {
  it('plays a card after a short pause and takes longer to answer truco', () => {
    const game = newGame({ seed: 1 })
    expect(botDelay(game, () => 0)).toBe(BOT_PLAY_DELAY_MS[0])
    expect(botDelay(game, () => 1)).toBe(BOT_PLAY_DELAY_MS[1])

    const called = reduce(game, { type: 'truco', seat: game.hand.turn })
    expect(called.ok && botDelay(called.state, () => 0)).toBe(BOT_DECISION_DELAY_MS[0])
  })
})
