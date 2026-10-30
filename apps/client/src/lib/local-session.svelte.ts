import {
  BOT_TAUNT_COOLDOWN_MS,
  botDelay,
  decide,
  tauntReaction,
  type Difficulty,
} from '@truco/bots'
import {
  createRandom,
  newGame,
  reduce,
  seatsToAct,
  toPlayerView,
  type Action,
  type GameEvent,
  type GameState,
  type Seat,
} from '@truco/engine'
import { nextTrack, type TauntId, type TrackId } from '@truco/protocol'
import { GameSession, ROUND_HOLD_MS, tauntText } from './session.svelte'
import { sound } from './sound.svelte'
import { t } from './strings'

const HUMAN: Seat = 0
const BOT_NAMES = ['Tonhão', 'Dona Cida', 'Zé do Bar']
const NEXT_HAND_MS = 2600
/** What the bots reply when you taunt them. */
const COMEBACKS: TauntId[] = ['gonna-cry', 'laugh', 'scared', 'eyes', 'butterfingers']

/** Offline practice: engine and bots running in the browser, you in seat 0. */
export class LocalSession extends GameSession {
  override readonly canTaunt = true
  private state: GameState
  private botTauntAt = [0, 0, 0, 0]
  private random: () => number
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    nick: string,
    private difficulty: Difficulty,
    seed = Math.floor(Math.random() * 2 ** 31),
  ) {
    super()
    this.random = createRandom(seed)
    this.state = newGame({ seed, dealer: 3 })
    this.names = [nick || t.you, ...BOT_NAMES]
    this.receive(toPlayerView(this.state, HUMAN), [])
    this.schedule(0)
  }

  act(action: Action): void {
    const result = reduce(this.state, action)
    if (!result.ok) return
    this.state = result.state
    this.receive(toPlayerView(this.state, HUMAN), result.events)
    this.botTaunts(result.events)
    const roundClosed = result.events.some((e) => e.type === 'roundEnded')
    this.schedule(roundClosed ? ROUND_HOLD_MS : 0)
  }

  override taunt(id: TauntId): void {
    sound.taunt(id)
    this.shout(HUMAN, tauntText(id))
    // Sometimes an opponent fires back, with the delay of someone thinking of a reply.
    if (this.random() < 0.5) {
      const seat = this.random() < 0.5 ? 1 : 3
      const reply = COMEBACKS[Math.floor(this.random() * COMEBACKS.length)]!
      setTimeout(() => this.botSays(seat, reply), 900 + this.random() * 600)
    }
  }

  close(): void {
    clearTimeout(this.timer)
  }

  chooseTrack(trackId: TrackId | null): void {
    this.jukebox = { trackId, startedAt: trackId ? Date.now() : null }
  }

  trackEnded(trackId: TrackId): void {
    if (this.jukebox.trackId === trackId) this.chooseTrack(nextTrack(trackId))
  }

  /** Same rule as the server: at most one bot taunts per move. */
  private botTaunts(events: GameEvent[]): void {
    for (const seat of [1, 2, 3] as Seat[]) {
      if (Date.now() - this.botTauntAt[seat]! < BOT_TAUNT_COOLDOWN_MS) continue
      const id = tauntReaction(events, seat, this.random)
      if (id && this.botSays(seat, id)) return
    }
  }

  private botSays(seat: Seat, id: TauntId): boolean {
    const now = Date.now()
    if (now - this.botTauntAt[seat]! < BOT_TAUNT_COOLDOWN_MS) return false
    this.botTauntAt[seat] = now
    sound.taunt(id)
    this.shout(seat, tauntText(id))
    return true
  }

  /** Schedules the bots' next move (or the next hand) after a natural pause. */
  private schedule(extraDelay: number): void {
    clearTimeout(this.timer)
    const { state } = this
    if (state.phase === 'gameOver') return
    if (state.phase === 'handOver') {
      this.timer = setTimeout(() => this.act({ type: 'nextHand' }), NEXT_HAND_MS)
      return
    }
    const seats = seatsToAct(state)
    // The bot acts if it is among the deciders (including answering truco along with you).
    const seat = seats.find((s) => s !== HUMAN)
    if (seat === undefined) return
    this.timer = setTimeout(
      () =>
        this.act(
          decide({
            view: toPlayerView(state, seat),
            random: this.random,
            difficulty: this.difficulty,
          }),
        ),
      extraDelay + botDelay(state, this.random),
    )
  }
}
