import {
  cardPower,
  HIDDEN_POWER,
  teamOf,
  WINNING_SCORE,
  type Action,
  type PlayerView,
  type Seat,
} from '@truco/engine'
import { winProbability } from './montecarlo'
import { greedyPick, trickOf } from './policy'

export type Difficulty = 'facil' | 'normal'

interface Profile {
  /** Chance mínima de levar a mão para pedir truco. */
  callTruco: number
  /** Chance mínima para aumentar em resposta a um pedido. */
  raise: number
  /** Folga somada ao limiar de valor esperado para aceitar; quanto maior, mais medroso. */
  caution: number
  /** Probabilidade de blefar pedindo truco com mão média. */
  bluff: number
  samples: number
  /** Monte Carlo também na escolha da carta; senão joga pela regra gulosa. */
  searchCards: boolean
  /** Chance de errar de propósito: carta ao acaso ou resposta ao truco trocada. */
  blunder: number
}

export const PROFILES: Record<Difficulty, Profile> = {
  facil: {
    callTruco: 0.8,
    raise: 0.92,
    caution: 0.2,
    bluff: 0,
    samples: 30,
    searchCards: false,
    blunder: 0.25,
  },
  normal: {
    callTruco: 0.68,
    raise: 0.82,
    caution: 0.2,
    bluff: 0.06,
    samples: 80,
    searchCards: true,
    blunder: 0,
  },
}

export interface BotInput {
  view: PlayerView
  random: () => number
  difficulty?: Difficulty
}

/** Escolhe a ação do bot para a cadeira da view. Só chame quando houver jogada legal. */
export function decide({ view, random, difficulty = 'normal' }: BotInput): Action {
  const seat = view.seat
  if (seat === null) throw new Error('espectador não joga')
  const profile = PROFILES[difficulty]
  const { legal } = view
  const chance = () => winProbability(view, random, profile.samples)

  if (legal.onze) {
    // Jogar vale 3 para quem ganhar; correr entrega 1. Compensa com chance acima de 1/3.
    return { type: 'onze', seat, accept: chance() >= 1 / 3 + profile.caution }
  }
  if (legal.accept) return respond(view, seat, profile, chance(), random)
  if (legal.truco) {
    const p = chance()
    if (p >= profile.callTruco || (p >= 0.3 && random() < profile.bluff)) {
      return { type: 'truco', seat }
    }
  }
  if (legal.play) return chooseCard(view, seat, profile, random)
  throw new Error('bot chamado sem jogada legal')
}

function respond(
  view: PlayerView,
  seat: Seat,
  profile: Profile,
  p: number,
  random: () => number,
): Action {
  const proposed = view.hand.truco!.stake
  const current = view.hand.stake
  const opponentScore = view.scores[1 - teamOf(seat)]!
  // Correr dá o valor atual ao adversário; se isso já fecha o jogo, não há o que perder.
  if (opponentScore + current >= WINNING_SCORE) return { type: 'accept', seat }
  if (view.legal.truco && p >= profile.raise) return { type: 'truco', seat }

  // Aceitar vale p·s − (1−p)·s; correr vale −atual. Aceita quando o primeiro é maior.
  const breakEven = (proposed - current) / (2 * proposed)
  const accepts = p >= breakEven + profile.caution || random() < profile.bluff / 2
  const flipped = random() < profile.blunder ? !accepts : accepts
  return { type: flipped ? 'accept' : 'run', seat }
}

function chooseCard(view: PlayerView, seat: Seat, profile: Profile, random: () => number): Action {
  const { hand } = view
  // Mão de ferro: às cegas, qualquer carta serve.
  if (hand.myCards.some((card) => card === null)) {
    return { type: 'play', seat, index: Math.floor(random() * hand.myCards.length) }
  }

  const powers = hand.myCards.map((card) => cardPower(card!, hand.manilha))
  const greedy = greedyPick(powers, currentTrick(view), teamOf(seat))
  let index = greedy.index

  if (random() < profile.blunder) {
    index = Math.floor(random() * powers.length)
  } else if (profile.searchCards && powers.length > 1) {
    // Avalia cada carta e prefere, no empate, gastar a mais fraca.
    let bestScore = -Infinity
    powers.forEach((power, candidate) => {
      const score = winProbability(view, random, profile.samples, candidate) - power * 0.002
      if (score > bestScore) {
        bestScore = score
        index = candidate
      }
    })
  }

  const isDiscard = powers[index] === Math.min(...powers) && greedy.discard
  return { type: 'play', seat, index, ...(isDiscard && view.legal.hide ? { hidden: true } : {}) }
}

function currentTrick(view: PlayerView) {
  const rounds = view.hand.rounds
  const current = rounds[rounds.length - 1]!
  return trickOf(
    current.plays.map((play) => ({
      team: teamOf(play.seat),
      power: play.card && !play.hidden ? cardPower(play.card, view.hand.manilha) : HIDDEN_POWER,
    })),
    rounds.length - 1,
    rounds[0]?.result ?? null,
  )
}
