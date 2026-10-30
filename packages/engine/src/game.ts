import { cardPower, cleanDeck, HIDDEN_POWER, manilhaFor } from './cards'
import { shuffle } from './rng'
import {
  nextSeat,
  otherTeam,
  SEATS,
  STAKES,
  teamOf,
  WINNING_SCORE,
  type Action,
  type GameError,
  type GameEvent,
  type GameState,
  type HandEndReason,
  type HandKind,
  type HandState,
  type ReduceResult,
  type Round,
  type RoundResult,
  type Seat,
  type Team,
} from './types'

export interface NewGameOptions {
  seed: number
  dealer?: Seat
}

export function newGame({ seed, dealer = 0 }: NewGameOptions): GameState {
  const scores: [number, number] = [0, 0]
  const [hand, nextSeed] = dealHand({ number: 1, dealer, scores, seed })
  return { phase: 'playing', scores, hand, lastHand: null, winner: null, seed: nextSeed }
}

/** Applies an action. Never mutates the given state. */
export function reduce(state: GameState, action: Action): ReduceResult {
  const error = validate(state, action)
  if (error) return { ok: false, error }

  const next = structuredClone(state)
  const events: GameEvent[] = []
  apply(next, action, events)
  return { ok: true, state: next, events }
}

export function isLegal(state: GameState, action: Action): boolean {
  return validate(state, action) === null
}

/** Every valid action for the seat right now. Basis for the bots and the property tests. */
export function legalActions(state: GameState, seat: Seat): Action[] {
  const candidates: Action[] = [
    { type: 'truco', seat },
    { type: 'accept', seat },
    { type: 'run', seat },
    { type: 'eleven', seat, accept: true },
    { type: 'eleven', seat, accept: false },
  ]
  state.hand.cards[seat]?.forEach((_, index) => {
    candidates.push({ type: 'play', seat, index }, { type: 'play', seat, index, hidden: true })
  })
  return candidates.filter((action) => isLegal(state, action))
}

/** Seats that can act now; empty when the hand is over. */
export function seatsToAct(state: GameState): Seat[] {
  if (state.phase !== 'playing') return []
  const { hand } = state
  if (hand.elevenPending !== null) return SEATS.filter((s) => teamOf(s) === hand.elevenPending)
  if (hand.truco) {
    const { team, runVotes } = hand.truco
    return SEATS.filter((s) => teamOf(s) !== team && !runVotes.includes(s))
  }
  return [hand.turn]
}

export function currentRound(hand: HandState): Round {
  return hand.rounds[hand.rounds.length - 1]!
}

export function nextStake(stake: number): number | null {
  const index = STAKES.indexOf(stake as (typeof STAKES)[number])
  return STAKES[index + 1] ?? null
}

/** Who wins the round; a tie when the highest cards belong to different teams. */
export function roundOutcome(
  round: Round,
  hand: Pick<HandState, 'manilha'>,
): {
  result: RoundResult
  leader: Seat
} {
  const powers = round.plays.map((play) =>
    play.hidden ? HIDDEN_POWER : cardPower(play.card, hand.manilha),
  )
  const best = Math.max(...powers)
  const top = round.plays.filter((_, i) => powers[i] === best)
  const teams = new Set(top.map((play) => teamOf(play.seat)))
  const leader = top[0]!.seat
  return { result: teams.size === 1 ? teamOf(leader) : 'tie', leader }
}

/**
 * Hand winner under the Paulista tie rules (cangar), or undefined if it can't be decided
 * yet. null means all three rounds tied and nobody scores.
 */
export function handWinner(results: RoundResult[]): Team | null | undefined {
  const [first, second, third] = results
  if (results.length < 2) return undefined
  if (results.length === 2) {
    if (first === 'tie' && second !== 'tie') return second
    if (first !== 'tie' && (second === 'tie' || second === first)) return first
    return undefined
  }
  if (third !== 'tie') return third
  return first === 'tie' ? (second === 'tie' ? null : second) : first
}

function validate(state: GameState, action: Action): GameError | null {
  if (state.phase === 'gameOver') return 'game_over'
  if (action.type === 'nextHand') return state.phase === 'handOver' ? null : 'not_hand_over'
  if (state.phase !== 'playing') return 'not_playing'

  const { hand } = state
  const team = teamOf(action.seat)

  if (action.type === 'eleven') {
    if (hand.elevenPending === null) return 'no_eleven_pending'
    return team === hand.elevenPending ? null : 'not_your_team'
  }
  if (hand.elevenPending !== null) return 'eleven_pending'

  if (action.type === 'accept' || action.type === 'run') {
    if (!hand.truco) return 'no_truco_pending'
    if (team === hand.truco.team) return 'not_your_team'
    return hand.truco.runVotes.includes(action.seat) ? 'already_voted' : null
  }

  if (action.type === 'truco') {
    if (hand.kind !== 'normal') return 'truco_not_allowed'
    // Raising only happens on your turn to play, never as the answer to a call.
    if (hand.truco) return 'truco_pending'
    if (hand.turn !== action.seat) return 'not_your_turn'
    if (hand.raisedBy === team || nextStake(hand.stake) === null) return 'truco_not_allowed'
    return null
  }

  if (hand.truco) return 'truco_pending'
  if (hand.turn !== action.seat) return 'not_your_turn'
  const cards = hand.cards[action.seat]!
  if (!Number.isInteger(action.index) || action.index < 0 || action.index >= cards.length) {
    return 'invalid_card'
  }
  if (action.hidden && (hand.rounds.length < 2 || hand.kind === 'iron')) {
    return 'hidden_not_allowed'
  }
  return null
}

function apply(state: GameState, action: Action, events: GameEvent[]): void {
  const { hand } = state
  switch (action.type) {
    case 'nextHand': {
      const [nextHand, seed] = dealHand({
        number: hand.number + 1,
        dealer: nextSeat(hand.dealer),
        scores: state.scores,
        seed: state.seed,
      })
      state.hand = nextHand
      state.seed = seed
      state.phase = 'playing'
      events.push({
        type: 'handStarted',
        number: nextHand.number,
        dealer: nextHand.dealer,
        kind: nextHand.kind,
      })
      return
    }
    case 'eleven': {
      events.push({ type: 'elevenDecided', seat: action.seat, accept: action.accept })
      if (action.accept) {
        hand.elevenPending = null
      } else {
        endHand(state, otherTeam(teamOf(action.seat)), 1, 'elevenRan', events)
      }
      return
    }
    case 'truco': {
      // Raising in response accepts the proposed stake before going up.
      if (hand.truco) hand.stake = hand.truco.stake
      const stake = nextStake(hand.stake)!
      hand.truco = { team: teamOf(action.seat), caller: action.seat, stake, runVotes: [] }
      events.push({ type: 'trucoCalled', seat: action.seat, stake })
      return
    }
    case 'accept': {
      const truco = hand.truco!
      hand.stake = truco.stake
      hand.raisedBy = truco.team
      hand.truco = null
      events.push({ type: 'trucoAccepted', seat: action.seat, stake: hand.stake })
      return
    }
    case 'run': {
      const truco = hand.truco!
      // Running only counts when both partners want it; the first vote waits.
      if (truco.runVotes.length === 0) {
        truco.runVotes.push(action.seat)
        events.push({ type: 'runVoted', seat: action.seat })
        return
      }
      events.push({ type: 'ran', seat: action.seat })
      endHand(state, truco.team, hand.stake, 'ran', events)
      return
    }
    case 'play': {
      const [card] = hand.cards[action.seat]!.splice(action.index, 1)
      const hidden = action.hidden ?? false
      const round = currentRound(hand)
      round.plays.push({ seat: action.seat, card: card!, hidden })
      events.push({ type: 'cardPlayed', seat: action.seat, card: hidden ? null : card! })
      if (round.plays.length < SEATS.length) {
        hand.turn = nextSeat(action.seat)
        return
      }
      finishRound(state, round, events)
      return
    }
  }
}

function finishRound(state: GameState, round: Round, events: GameEvent[]): void {
  const { hand } = state
  const { result, leader } = roundOutcome(round, hand)
  round.result = result
  events.push({ type: 'roundEnded', result })

  const results = hand.rounds.map((r) => r.result!)
  const winner = handWinner(results)
  if (winner !== undefined) {
    endHand(state, winner, hand.stake, 'rounds', events)
    return
  }
  hand.rounds.push({ plays: [], result: null })
  hand.turn = leader
}

function endHand(
  state: GameState,
  winner: Team | null,
  points: number,
  reason: HandEndReason,
  events: GameEvent[],
): void {
  const awarded = winner === null ? 0 : points
  if (winner !== null) {
    state.scores[winner] = Math.min(WINNING_SCORE, state.scores[winner] + awarded)
  }
  state.hand.truco = null
  state.lastHand = { winner, points: awarded, reason }
  events.push({ type: 'handEnded', result: state.lastHand, scores: [...state.scores] })

  if (winner !== null && state.scores[winner] >= WINNING_SCORE) {
    state.phase = 'gameOver'
    state.winner = winner
    events.push({ type: 'gameEnded', winner })
  } else {
    state.phase = 'handOver'
  }
}

interface DealInput {
  number: number
  dealer: Seat
  scores: readonly [number, number]
  seed: number
}

function dealHand({ number, dealer, scores, seed }: DealInput): [HandState, number] {
  const [deck, nextSeed] = shuffle(cleanDeck(), seed)
  const first = nextSeat(dealer)
  const cards: HandState['cards'] = [[], [], [], []]
  for (let i = 0; i < 12; i++) {
    cards[(first + i) % 4]!.push(deck[i]!)
  }
  const vira = deck[12]!
  const kind = handKind(scores)
  const elevenTeam = kind === 'eleven' ? (scores[0] === WINNING_SCORE - 1 ? 0 : 1) : null

  return [
    {
      number,
      dealer,
      vira,
      manilha: manilhaFor(vira),
      cards,
      rounds: [{ plays: [], result: null }],
      turn: first,
      stake: kind === 'eleven' ? 3 : 1,
      raisedBy: null,
      truco: null,
      kind,
      elevenPending: elevenTeam,
    },
    nextSeed,
  ]
}

function handKind(scores: readonly [number, number]): HandKind {
  const atEleven = scores.filter((score) => score === WINNING_SCORE - 1).length
  if (atEleven === 2) return 'iron'
  return atEleven === 1 ? 'eleven' : 'normal'
}
