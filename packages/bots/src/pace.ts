import type { GameState } from '@truco/engine'

/** Pause before a bot plays a card, in ms: long enough to follow who played what. */
export const BOT_PLAY_DELAY_MS = [1300, 2100] as const
/** Pause before a bot answers truco or decides the hand of eleven: the table gets to react. */
export const BOT_DECISION_DELAY_MS = [2200, 3200] as const

/** How long a bot "thinks" before acting in this state. */
export function botDelay(state: GameState, random: () => number): number {
  const decision = state.hand.truco !== null || state.hand.elevenPending !== null
  const [min, max] = decision ? BOT_DECISION_DELAY_MS : BOT_PLAY_DELAY_MS
  return min + random() * (max - min)
}
