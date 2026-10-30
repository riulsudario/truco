import type { RoundResult, Team } from '@truco/engine'

/** Summary of the round in progress from the point of view of whoever plays next. */
export interface Trick {
  /** Highest power on the table (-Infinity if nobody has played). */
  best: number
  /** Team holding the highest card; null if nobody has played or it is tied. */
  winningTeam: Team | null
  plays: number
  roundIndex: number
  firstResult: RoundResult | null
}

export function trickOf(
  plays: readonly { team: Team; power: number }[],
  roundIndex: number,
  firstResult: RoundResult | null,
): Trick {
  let best = -Infinity
  let winningTeam: Team | null = null
  for (const { team, power } of plays) {
    if (power > best) {
      best = power
      winningTeam = team
    } else if (power === best && team !== winningTeam) {
      winningTeam = null
    }
  }
  return { best, winningTeam, plays: plays.length, roundIndex, firstResult }
}

export type Pick = { index: number; discard: boolean }

/**
 * Greedy play for someone who only knows their own cards: leads while saving manilhas, lets
 * the partner take it, wins with the lowest card that does and throws away the lowest when
 * it can't. Used by the easy bot and in the Monte Carlo simulations.
 */
export function greedyPick(powers: readonly number[], trick: Trick, myTeam: Team): Pick {
  const order = powers.map((power, index) => ({ power, index })).sort((a, b) => a.power - b.power)
  const lowest = order[0]!
  const highest = order[order.length - 1]!
  const discard = { index: lowest.index, discard: true }

  if (trick.plays === 0) {
    if (trick.roundIndex > 0) return { index: highest.index, discard: false }
    const nonManilha = order.filter((c) => c.power < 10)
    return { index: (nonManilha[nonManilha.length - 1] ?? lowest).index, discard: false }
  }

  if (trick.winningTeam === myTeam && (trick.plays === 3 || trick.best >= 4)) return discard

  const beater = order.find((c) => c.power > trick.best)
  if (beater) return { index: beater.index, discard: false }

  // We already took the first round: tying this one also gives us the hand.
  const tie = order.find((c) => c.power === trick.best)
  if (tie && trick.firstResult === myTeam && trick.roundIndex > 0) {
    return { index: tie.index, discard: false }
  }
  return discard
}
