import { teamOf, type GameEvent, type Seat } from '@truco/engine'
import type { TauntId } from '@truco/protocol'

/** Minimum interval between taunts from the same bot, so it doesn't turn into spam. */
export const BOT_TAUNT_COOLDOWN_MS = 8000

interface Reaction {
  chance: number
  options: TauntId[]
}

/**
 * How a bot reacts to what just happened at the table. Returns the taunt or null.
 * It only looks at public events, like any player.
 */
export function tauntReaction(
  events: GameEvent[],
  seat: Seat,
  random: () => number,
): TauntId | null {
  const team = teamOf(seat)
  for (const event of [...events].reverse()) {
    const reaction = react(event, seat, team)
    if (reaction && random() < reaction.chance) {
      return reaction.options[Math.floor(random() * reaction.options.length)]!
    }
  }
  return null
}

function react(event: GameEvent, seat: Seat, team: 0 | 1): Reaction | null {
  switch (event.type) {
    case 'trucoCalled':
      // The caller already shouts the recorded line; their partner cheers, the other team gets scared.
      if (event.seat === seat) return null
      return teamOf(event.seat) === team
        ? { chance: 0.25, options: ['truco-thief', 'scared', 'fire'] }
        : { chance: 0.15, options: ['eyes', 'ask-for-music'] }
    case 'ran':
      return teamOf(event.seat) === team
        ? null
        : { chance: 0.45, options: ['scared', 'gonna-cry', 'laugh'] }
    case 'gameEnded':
      return event.winner === team
        ? { chance: 0.8, options: ['clap', 'ask-for-music', 'laugh'] }
        : { chance: 0.5, options: ['robbed', 'cry', 'angry'] }
    case 'handEnded': {
      const { winner, points } = event.result
      if (winner === null) return { chance: 0.2, options: ['tied'] }
      // A hand worth more draws more reaction.
      const weight = points >= 3 ? 2 : 1
      return winner === team
        ? { chance: 0.15 * weight, options: ['laugh', 'got-your-back', 'butterfingers'] }
        : { chance: 0.1 * weight, options: ['robbed', 'angry', 'skull'] }
    }
    case 'roundEnded':
      return event.result === 'tie' ? { chance: 0.15, options: ['tied'] } : null
    default:
      return null
  }
}
