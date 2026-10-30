import type { Card, Rank } from './cards'

export type Seat = 0 | 1 | 2 | 3
/** Team 0 is seats 0 and 2; team 1 is seats 1 and 3. */
export type Team = 0 | 1

export const SEATS: readonly Seat[] = [0, 1, 2, 3]
export const WINNING_SCORE = 12
/** Truco stake ladder: 1, truco (3), six, nine, twelve. */
export const STAKES = [1, 3, 6, 9, 12] as const

export const teamOf = (seat: Seat): Team => (seat % 2) as Team
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat
export const partnerOf = (seat: Seat): Seat => ((seat + 2) % 4) as Seat
export const otherTeam = (team: Team): Team => (1 - team) as Team

export interface Play {
  seat: Seat
  card: Card
  /** Card played face down (only from the second round on). */
  hidden: boolean
}

export type RoundResult = Team | 'tie'

export interface Round {
  plays: Play[]
  result: RoundResult | null
}

export interface TrucoCall {
  team: Team
  caller: Seat
  /** Proposed stake, not accepted yet. */
  stake: number
  /**
   * Who on the challenged team already said they want to run. Accepting (or raising) takes
   * just one partner; running takes both.
   */
  runVotes: Seat[]
}

/** Hand of eleven: one team at 11. Iron hand: both at 11, cards played blind. */
export type HandKind = 'normal' | 'eleven' | 'iron'

export interface HandState {
  number: number
  dealer: Seat
  vira: Card
  manilha: Rank
  /** Cards each seat still holds, indexed by seat. */
  cards: Card[][]
  /** The last one is the round in progress while its result is null. */
  rounds: Round[]
  turn: Seat
  /** Accepted stake of the hand. */
  stake: number
  /** Team that made the last accepted raise; it can't raise again. */
  raisedBy: Team | null
  truco: TrucoCall | null
  kind: HandKind
  /** Team at 11 deciding whether to play the hand of eleven. */
  elevenPending: Team | null
}

export type HandEndReason = 'rounds' | 'ran' | 'elevenRan'

export interface HandResult {
  winner: Team | null
  points: number
  reason: HandEndReason
}

export type GamePhase = 'playing' | 'handOver' | 'gameOver'

export interface GameState {
  phase: GamePhase
  scores: [number, number]
  hand: HandState
  lastHand: HandResult | null
  winner: Team | null
  seed: number
}

export type Action =
  | { type: 'play'; seat: Seat; index: number; hidden?: boolean }
  /** Call truco on your turn or raise when responding. */
  | { type: 'truco'; seat: Seat }
  | { type: 'accept'; seat: Seat }
  | { type: 'run'; seat: Seat }
  | { type: 'eleven'; seat: Seat; accept: boolean }
  | { type: 'nextHand' }

export type GameEvent =
  | { type: 'handStarted'; number: number; dealer: Seat; kind: HandKind }
  /** card is null when the card was played face down. */
  | { type: 'cardPlayed'; seat: Seat; card: Card | null }
  | { type: 'roundEnded'; result: RoundResult }
  | { type: 'trucoCalled'; seat: Seat; stake: number }
  | { type: 'trucoAccepted'; seat: Seat; stake: number }
  /** One partner wants to run; the other still has to decide. */
  | { type: 'runVoted'; seat: Seat }
  | { type: 'ran'; seat: Seat }
  | { type: 'elevenDecided'; seat: Seat; accept: boolean }
  | { type: 'handEnded'; result: HandResult; scores: [number, number] }
  | { type: 'gameEnded'; winner: Team }

export type GameError =
  | 'game_over'
  | 'not_playing'
  | 'not_hand_over'
  | 'not_your_turn'
  | 'invalid_card'
  | 'hidden_not_allowed'
  | 'truco_pending'
  | 'truco_not_allowed'
  | 'no_truco_pending'
  | 'already_voted'
  | 'not_your_team'
  | 'eleven_pending'
  | 'no_eleven_pending'

export type ReduceResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: GameError }
