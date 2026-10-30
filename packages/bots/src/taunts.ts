import { teamOf, type GameEvent, type Seat } from '@truco/engine'
import type { TauntId } from '@truco/protocol'

/** Intervalo mínimo entre provocações do mesmo bot, para não virar spam. */
export const BOT_TAUNT_COOLDOWN_MS = 8000

interface Reaction {
  chance: number
  options: TauntId[]
}

/**
 * Como um bot reage ao que acabou de acontecer na mesa. Devolve a provocação ou null.
 * Só olha eventos públicos, igual a qualquer jogador.
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
      // Quem pediu já grita a fala gravada; o parceiro dele põe pilha, o outro time se assusta.
      if (event.seat === seat) return null
      return teamOf(event.seat) === team
        ? { chance: 0.25, options: ['truco-ladrao', 'medinho', 'fogo'] }
        : { chance: 0.15, options: ['olhos', 'pede-musica'] }
    case 'ran':
      return teamOf(event.seat) === team
        ? null
        : { chance: 0.45, options: ['medinho', 'vai-chorar', 'risada'] }
    case 'gameEnded':
      return event.winner === team
        ? { chance: 0.8, options: ['palmas', 'pede-musica', 'risada'] }
        : { chance: 0.5, options: ['fui-roubado', 'choro', 'raiva'] }
    case 'handEnded': {
      const { winner, points } = event.result
      if (winner === null) return { chance: 0.2, options: ['cangou'] }
      // Mão valendo mais rende mais reação.
      const weight = points >= 3 ? 2 : 1
      return winner === team
        ? { chance: 0.15 * weight, options: ['risada', 'tamo-junto', 'mao-de-alface'] }
        : { chance: 0.1 * weight, options: ['fui-roubado', 'raiva', 'caveira'] }
    }
    case 'roundEnded':
      return event.result === 'tie' ? { chance: 0.15, options: ['cangou'] } : null
    default:
      return null
  }
}
