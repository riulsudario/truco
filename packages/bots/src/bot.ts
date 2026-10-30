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

export type Difficulty = 'easy' | 'normal'

interface Profile {
  /** Minimum chance of winning the hand to call truco. */
  callTruco: number
  /** Margin added to the expected-value threshold to accept; the higher, the more timid. */
  caution: number
  /** Probability of bluffing a truco call with an average hand. */
  bluff: number
  samples: number
  /** Monte Carlo for card choice too; otherwise plays by the greedy rule. */
  searchCards: boolean
  /** Chance of a deliberate mistake: a random card or a flipped truco answer. */
  blunder: number
}

export const PROFILES: Record<Difficulty, Profile> = {
  easy: {
    callTruco: 0.8,
    caution: 0.2,
    bluff: 0,
    samples: 30,
    searchCards: false,
    blunder: 0.25,
  },
  normal: {
    callTruco: 0.68,
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

/** Picks the bot's action for the view's seat. Only call it when a legal move exists. */
export function decide({ view, random, difficulty = 'normal' }: BotInput): Action {
  const seat = view.seat
  if (seat === null) throw new Error('spectators do not play')
  const profile = PROFILES[difficulty]
  const { legal } = view
  const chance = () => winProbability(view, random, profile.samples)

  if (legal.eleven) {
    // Playing is worth 3 to the winner; running gives away 1. Worth it above a 1/3 chance.
    return { type: 'eleven', seat, accept: chance() >= 1 / 3 + profile.caution }
  }
  if (legal.accept) return respond(view, seat, profile, chance(), random)
  if (legal.truco) {
    const p = chance()
    if (p >= profile.callTruco || (p >= 0.3 && random() < profile.bluff)) {
      return { type: 'truco', seat }
    }
  }
  if (legal.play) return chooseCard(view, seat, profile, random)
  throw new Error('bot called without a legal move')
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
  // Running gives the current stake to the opponents; if that already ends the game, there is nothing to lose.
  if (opponentScore + current >= WINNING_SCORE) return { type: 'accept', seat }

  // Accepting is worth p·s − (1−p)·s; running is worth −current. Accept when the former is higher.
  const breakEven = (proposed - current) / (2 * proposed)
  const accepts = p >= breakEven + profile.caution || random() < profile.bluff / 2
  const flipped = random() < profile.blunder ? !accepts : accepts
  return { type: flipped ? 'accept' : 'run', seat }
}

function chooseCard(view: PlayerView, seat: Seat, profile: Profile, random: () => number): Action {
  const { hand } = view
  // Iron hand: playing blind, any card will do.
  if (hand.myCards.some((card) => card === null)) {
    return { type: 'play', seat, index: Math.floor(random() * hand.myCards.length) }
  }

  const powers = hand.myCards.map((card) => cardPower(card!, hand.manilha))
  const greedy = greedyPick(powers, currentTrick(view), teamOf(seat))
  let index = greedy.index

  if (random() < profile.blunder) {
    index = Math.floor(random() * powers.length)
  } else if (profile.searchCards && powers.length > 1) {
    // Evaluates each card and, on a tie, prefers spending the weakest.
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
