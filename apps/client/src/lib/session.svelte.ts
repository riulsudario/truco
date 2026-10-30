import {
  teamOf,
  type Action,
  type GameEvent,
  type PlayerView,
  type RoundView,
  type Seat,
} from '@truco/engine'
import { TAUNTS, type Avatar, type TauntId, type TrackId } from '@truco/protocol'
import { sound } from './sound.svelte'
import { voiceFor } from './avatars'
import { commonLines, speak } from './voice'
import { raiseLabel, t } from './strings'

/** Balloon for someone without a seat: the audience. */
export const AUDIENCE = -1

export const tauntText = (id: TauntId) => TAUNTS.find((taunt) => taunt.id === id)?.text ?? ''

/** How long a finished round stays on the table before being cleared. */
export const ROUND_HOLD_MS = 1300
const SHOUT_MS = 1800
/** A recorded line's balloon stays longer: it's a whole sentence, not a word. */
const SPOKEN_MS = 3200
const LOG_SIZE = 6

/**
 * What the table needs to draw and play, whether the game comes from the browser (practice)
 * or from the server (online). The session receives views and events and only handles the
 * screen's pacing.
 */
export abstract class GameSession {
  view = $state.raw<PlayerView | null>(null)
  names = $state<string[]>(['', '', '', ''])
  /** Look chosen by whoever sits in each seat (null: no choice, picked from the name). */
  avatars = $state<(Avatar | null)[]>([null, null, null, null])
  /** Round shown on the table: a finished one stays a while before the new one replaces it. */
  heldRound = $state.raw<RoundView | null>(null)
  shouts = $state<Record<number, string>>({})
  /** Events from the last batch received, so the scene can animate whoever acted. */
  lastEvents = $state.raw<GameEvent[]>([])
  /** Latest lines and happenings at the table, oldest to newest. */
  log = $state<string[]>([])
  /** Track playing; startedAt already on this browser's clock (epoch ms). */
  jukebox = $state<{ trackId: TrackId | null; startedAt: number | null }>({
    trackId: null,
    startedAt: null,
  })
  /** Deadline (epoch ms) for whoever's turn it is, when the server runs the clock. */
  deadline = $state<number | null>(null)
  private shoutTimers: Record<number, ReturnType<typeof setTimeout>> = {}
  private holdTimer: ReturnType<typeof setTimeout> | undefined

  abstract act(action: Action): void
  abstract close(): void
  /** Taunts only exist online; in practice there's nobody to taunt. */
  readonly canTaunt: boolean = false
  /** Online the jukebox belongs to the room; in practice, only to you. */
  readonly sharedJukebox: boolean = false
  taunt(_id: TauntId): void {}
  /** Picks the track (null turns it off). Online it applies to the whole room. */
  abstract chooseTrack(trackId: TrackId | null): void
  /** The track ended: move on to the next one. */
  abstract trackEnded(trackId: TrackId): void

  get tableRound(): RoundView | null {
    if (this.heldRound) return this.heldRound
    const rounds = this.view?.hand.rounds
    return rounds ? rounds[rounds.length - 1]! : null
  }

  /** Applies a new view and animates the events that led to it. */
  protected receive(view: PlayerView, events: GameEvent[]): void {
    // Rebuilds the round in progress card by card to show the one that closed in this batch.
    if (!this.view) this.log = [t.log.handStarted(view.hand.number, view.hand.kind)]
    let plays = [...(this.view?.hand.rounds.at(-1)?.plays ?? [])]
    for (const event of events) {
      this.animate(event)
      this.note(event, view)
      if (event.type === 'cardPlayed') {
        plays.push({ seat: event.seat, card: event.card, hidden: event.card === null })
      } else if (event.type === 'roundEnded') {
        this.hold({ plays, result: event.result })
        plays = []
      } else if (event.type === 'handStarted') {
        plays = []
      }
    }
    const wasMyTurn = this.view?.legal.play ?? false
    this.view = view
    if (events.length) this.lastEvents = events
    sound.forEvents(events, view.seat)
    // Recorded lines: the balloon shows exactly what is being shouted.
    const voices = this.names.map((name, seat) => voiceFor(name, this.avatars[seat]))
    if (events.some((e) => e.type === 'handStarted')) {
      const distinct = voices.filter((voice, seat) => voices.indexOf(voice) === seat)
      sound.preloadVoices(distinct.flatMap(commonLines))
    }
    for (const { seat, line } of speak(events, view, voices)) this.shout(seat, line.text, SPOKEN_MS)
    if (view.legal.play && !wasMyTurn) sound.play('turn')
  }

  /** Balloon above a seat (or the audience, with AUDIENCE). */
  shout(seat: Seat | typeof AUDIENCE, text: string, ms = SHOUT_MS): void {
    this.shouts[seat] = text
    clearTimeout(this.shoutTimers[seat])
    this.shoutTimers[seat] = setTimeout(() => delete this.shouts[seat], ms)
  }

  private animate(event: GameEvent): void {
    switch (event.type) {
      case 'trucoCalled':
        this.shout(event.seat, raiseLabel(event.stake))
        break
      case 'trucoAccepted':
        this.shout(event.seat, t.shouts.accept)
        break
      case 'ran':
        this.shout(event.seat, t.shouts.run)
        break
      case 'runVoted':
        this.shout(event.seat, t.shouts.wantsToRun)
        break
      case 'elevenDecided':
        this.shout(event.seat, event.accept ? t.shouts.elevenYes : t.shouts.elevenNo)
        break
      case 'cardPlayed':
      case 'handStarted':
        this.heldRound = null
        break
    }
  }

  private note(event: GameEvent, view: PlayerView): void {
    const me = view.seat
    const who = (seat: Seat) => (seat === me ? t.you : (this.names[seat] ?? ''))
    const ours = (team: 0 | 1) => me !== null && team === teamOf(me)
    let line: string | null = null
    switch (event.type) {
      case 'handStarted':
        line = t.log.handStarted(event.number, event.kind)
        break
      case 'trucoCalled':
        line = `${who(event.seat)}: ${raiseLabel(event.stake)}`
        break
      case 'trucoAccepted':
        line = `${who(event.seat)}: ${t.shouts.accept}`
        break
      case 'ran':
        line = t.log.ran(who(event.seat))
        break
      case 'runVoted':
        line = `${who(event.seat)}: ${t.shouts.wantsToRun}`
        break
      case 'elevenDecided':
        line = event.accept
          ? `${who(event.seat)}: ${t.shouts.elevenYes}`
          : t.log.ran(who(event.seat))
        break
      case 'roundEnded':
        line = event.result === 'tie' ? `${t.tie}!` : t.log.round(ours(event.result))
        break
      case 'handEnded': {
        const { winner, points } = event.result
        if (winner === null) line = t.handTied
        else line = ours(winner) ? t.handWon(points) : t.handLost(points)
        break
      }
      case 'gameEnded':
        line = ours(event.winner) ? t.gameWon : t.gameLost
        break
    }
    if (line) this.log = [...this.log, line].slice(-LOG_SIZE)
  }

  private hold(round: RoundView): void {
    this.heldRound = round
    clearTimeout(this.holdTimer)
    this.holdTimer = setTimeout(() => {
      if (this.view?.phase === 'playing') this.heldRound = null
    }, ROUND_HOLD_MS)
  }
}
