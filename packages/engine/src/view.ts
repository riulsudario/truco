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
  /** null for whoever can't see the card (face down, played by another seat). */
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
  eleven: boolean
}

/** What a seat (or a spectator, seat null) may know about the game. This is what goes over the wire. */
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
    elevenPending: Team | null
    rounds: RoundView[]
    /** Cards in each seat's hand. */
    cardCounts: number[]
    /** Own cards; null in the iron hand, which is played blind. */
    myCards: (Card | null)[]
    /** In the hand of eleven, the team at 11 sees the partner's cards before deciding. */
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
  eleven: false,
}

export function toPlayerView(state: GameState, seat: Seat | null): PlayerView {
  const { hand } = state
  const ownCards = seat === null ? [] : hand.cards[seat]!
  const seesPartner =
    seat !== null && hand.elevenPending !== null && teamOf(seat) === hand.elevenPending

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
      elevenPending: hand.elevenPending,
      rounds: hand.rounds.map((round) => ({
        result: round.result,
        plays: round.plays.map((play) => ({
          seat: play.seat,
          hidden: play.hidden,
          card: play.hidden && play.seat !== seat ? null : play.card,
        })),
      })),
      cardCounts: hand.cards.map((cards) => cards.length),
      myCards: hand.kind === 'iron' ? ownCards.map(() => null) : [...ownCards],
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
    eleven: actions.some((a) => a.type === 'eleven'),
  }
}
