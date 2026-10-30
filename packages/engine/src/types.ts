import type { Card, Rank } from './cards'

export type Seat = 0 | 1 | 2 | 3
/** Time 0 são as cadeiras 0 e 2; time 1 são as cadeiras 1 e 3. */
export type Team = 0 | 1

export const SEATS: readonly Seat[] = [0, 1, 2, 3]
export const WINNING_SCORE = 12
/** Escada do truco: vale 1, truco (3), seis, nove, doze. */
export const STAKES = [1, 3, 6, 9, 12] as const

export const teamOf = (seat: Seat): Team => (seat % 2) as Team
export const nextSeat = (seat: Seat): Seat => ((seat + 1) % 4) as Seat
export const partnerOf = (seat: Seat): Seat => ((seat + 2) % 4) as Seat
export const otherTeam = (team: Team): Team => (1 - team) as Team

export interface Play {
  seat: Seat
  card: Card
  /** Carta jogada encoberta (só a partir da segunda vaza). */
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
  /** Valor proposto, ainda não aceito. */
  stake: number
  /**
   * Quem do time desafiado já disse que quer correr. Para descer (ou aumentar) basta um da
   * dupla; para correr, os dois precisam querer.
   */
  runVotes: Seat[]
}

/** Mão de onze: um time com 11. Mão de ferro: os dois com 11, cartas às cegas. */
export type HandKind = 'normal' | 'onze' | 'ferro'

export interface HandState {
  number: number
  dealer: Seat
  vira: Card
  manilha: Rank
  /** Cartas que cada cadeira ainda tem, indexado pela cadeira. */
  cards: Card[][]
  /** A última é a vaza em andamento enquanto o resultado for null. */
  rounds: Round[]
  turn: Seat
  /** Valor aceito da mão. */
  stake: number
  /** Time que fez o último aumento aceito; ele não pode aumentar de novo. */
  raisedBy: Team | null
  truco: TrucoCall | null
  kind: HandKind
  /** Time com 11 decidindo se joga a mão de onze. */
  onzePending: Team | null
}

export type HandEndReason = 'rounds' | 'ran' | 'onzeRan'

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
  /** Pedir truco na sua vez ou aumentar ao responder. */
  | { type: 'truco'; seat: Seat }
  | { type: 'accept'; seat: Seat }
  | { type: 'run'; seat: Seat }
  | { type: 'onze'; seat: Seat; accept: boolean }
  | { type: 'nextHand' }

export type GameEvent =
  | { type: 'handStarted'; number: number; dealer: Seat; kind: HandKind }
  /** card é null quando a carta foi jogada encoberta. */
  | { type: 'cardPlayed'; seat: Seat; card: Card | null }
  | { type: 'roundEnded'; result: RoundResult }
  | { type: 'trucoCalled'; seat: Seat; stake: number }
  | { type: 'trucoAccepted'; seat: Seat; stake: number }
  /** Um da dupla quer correr; falta o parceiro decidir. */
  | { type: 'runVoted'; seat: Seat }
  | { type: 'ran'; seat: Seat }
  | { type: 'onzeDecided'; seat: Seat; accept: boolean }
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
  | 'onze_pending'
  | 'no_onze_pending'

export type ReduceResult =
  { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: GameError }
