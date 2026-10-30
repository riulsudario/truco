import type { RoundResult, Team } from '@truco/engine'

/** Resumo da vaza em andamento do ponto de vista de quem vai jogar. */
export interface Trick {
  /** Maior força na mesa (-Infinity se ninguém jogou). */
  best: number
  /** Time com a maior carta; null se ninguém jogou ou se está cangado. */
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
 * Jogada gulosa de quem conhece só as próprias cartas: abre guardando manilha, deixa o
 * parceiro levar, ganha com a menor carta que serve e joga fora a menor quando não dá.
 * Usada pelo bot fácil e nas simulações do Monte Carlo.
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

  // Já fizemos a primeira: cangar a vaza também nos dá a mão.
  const tie = order.find((c) => c.power === trick.best)
  if (tie && trick.firstResult === myTeam && trick.roundIndex > 0) {
    return { index: tie.index, discard: false }
  }
  return discard
}
