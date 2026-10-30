import type { Card, Rank } from './cards'
import { legalActions } from './game'
import {
  partnerOf,
  teamOf,
  type GamePhase,
  type GameState,
  type HandKind,
  type HandResult,
  type RoundResult,
  type Seat,
  type Team,
  type TrucoCall,
} from './types'

export interface PlayView {
  seat: Seat
  /** null para quem não pode ver a carta (encoberta jogada por outra cadeira). */
  card: Card | null
  hidden: boolean
}

export interface RoundView {
  plays: PlayView[]
  result: RoundResult | null
}

export interface LegalMoves {
  play: boolean
  hide: boolean
  truco: boolean
  accept: boolean
  run: boolean
  onze: boolean
}

/** O que uma cadeira (ou espectador, seat null) pode saber do jogo. É o que vai pela rede. */
export interface PlayerView {
  seat: Seat | null
  phase: GamePhase
  scores: [number, number]
  winner: Team | null
  lastHand: HandResult | null
  hand: {
    number: number
    dealer: Seat
    vira: Card
    manilha: Rank
    kind: HandKind
    turn: Seat
    stake: number
    raisedBy: Team | null
    truco: TrucoCall | null
    onzePending: Team | null
    rounds: RoundView[]
    /** Cartas na mão de cada cadeira. */
    cardCounts: number[]
    /** Cartas próprias; null na mão de ferro, que é jogada às cegas. */
    myCards: (Card | null)[]
    /** Na mão de onze, o time com 11 vê as cartas do parceiro antes de decidir. */
    partnerCards: Card[] | null
  }
  legal: LegalMoves
}

const NO_MOVES: LegalMoves = {
  play: false,
  hide: false,
  truco: false,
  accept: false,
  run: false,
  onze: false,
}

export function toPlayerView(state: GameState, seat: Seat | null): PlayerView {
  const { hand } = state
  const ownCards = seat === null ? [] : hand.cards[seat]!
  const seesPartner =
    seat !== null && hand.onzePending !== null && teamOf(seat) === hand.onzePending

  return {
    seat,
    phase: state.phase,
    scores: [...state.scores],
    winner: state.winner,
    lastHand: state.lastHand,
    hand: {
      number: hand.number,
      dealer: hand.dealer,
      vira: hand.vira,
      manilha: hand.manilha,
      kind: hand.kind,
      turn: hand.turn,
      stake: hand.stake,
      raisedBy: hand.raisedBy,
      truco: hand.truco,
      onzePending: hand.onzePending,
      rounds: hand.rounds.map((round) => ({
        result: round.result,
        plays: round.plays.map((play) => ({
          seat: play.seat,
          hidden: play.hidden,
          card: play.hidden && play.seat !== seat ? null : play.card,
        })),
      })),
      cardCounts: hand.cards.map((cards) => cards.length),
      myCards: hand.kind === 'ferro' ? ownCards.map(() => null) : [...ownCards],
      partnerCards: seesPartner ? [...hand.cards[partnerOf(seat)]!] : null,
    },
    legal: seat === null ? NO_MOVES : legalMoves(state, seat),
  }
}

function legalMoves(state: GameState, seat: Seat): LegalMoves {
  const actions = legalActions(state, seat)
  return {
    play: actions.some((a) => a.type === 'play'),
    hide: actions.some((a) => a.type === 'play' && a.hidden),
    truco: actions.some((a) => a.type === 'truco'),
    accept: actions.some((a) => a.type === 'accept'),
    run: actions.some((a) => a.type === 'run'),
    onze: actions.some((a) => a.type === 'onze'),
  }
}
