import type { Action, Seat } from '@truco/engine'
import {
  nextTrack,
  type TrackId,
  type ClientMessage,
  type ErrorCode,
  type RoomSnapshot,
  type ServerMessage,
  type TauntId,
} from '@truco/protocol'
import { playerToken } from './identity'
import { AUDIENCE, GameSession, tauntText } from './session.svelte'
import { sound } from './sound.svelte'

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed'
export type EndReason = 'kicked' | 'closed' | 'left' | ErrorCode

const RETRY_DELAYS = [500, 1000, 2000, 4000, 8000]
/** Close codes where reconnecting is pointless. */
const FINAL_CLOSE_CODES = new Set([1000, 4000, 4001, 4002, 4004])
const ERROR_TOAST_MS = 3000

/** Online room: talks to the room's Durable Object over WebSocket. */
export class OnlineSession extends GameSession {
  override readonly canTaunt = true
  override readonly sharedJukebox = true
  room = $state.raw<RoomSnapshot | null>(null)
  playerId = $state<string | null>(null)
  status = $state<ConnectionStatus>('connecting')
  endReason = $state<EndReason | null>(null)
  error = $state<ErrorCode | null>(null)
  /** Seats the server is waiting on to act. */
  waitingOn = $state<Seat[]>([])

  private ws: WebSocket | null = null
  private attempts = 0
  private errorTimer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    readonly code: string,
    private nick: string,
    private password?: string,
  ) {
    super()
    this.connect()
  }

  get isOwner(): boolean {
    return this.room !== null && this.room.ownerId === this.playerId
  }

  get me() {
    return this.room?.players.find((p) => p.id === this.playerId) ?? null
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  act(action: Action): void {
    if (action.type === 'nextHand') return
    // The server knows the sender's seat; it doesn't trust one coming from here.
    const { seat: _seat, ...rest } = action
    this.send({ t: 'game', action: rest })
  }

  chooseTrack(trackId: TrackId | null): void {
    this.send({ t: 'jukebox', trackId })
  }

  trackEnded(trackId: TrackId): void {
    this.send({ t: 'jukebox', trackId: nextTrack(trackId), after: trackId })
  }

  override taunt(id: TauntId): void {
    this.send({ t: 'taunt', id })
  }

  retryWithPassword(password: string): void {
    this.password = password
    this.endReason = null
    this.status = 'connecting'
    this.connect()
  }

  close(): void {
    this.send({ t: 'leave' })
    this.finish('left')
  }

  private connect(): void {
    clearTimeout(this.retryTimer)
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${protocol}://${location.host}/ws/room/${this.code}`)
    this.ws = ws
    ws.onopen = () => {
      this.attempts = 0
      ws.send(
        JSON.stringify({
          t: 'hello',
          nick: this.nick,
          token: playerToken(),
          ...(this.password ? { password: this.password } : {}),
        } satisfies ClientMessage),
      )
    }
    ws.onmessage = (event) => this.onMessage(JSON.parse(event.data as string) as ServerMessage)
    ws.onclose = (event) => {
      if (this.ws !== ws || this.status === 'closed') return
      if (FINAL_CLOSE_CODES.has(event.code) || this.attempts >= RETRY_DELAYS.length) {
        this.finish(this.endReason ?? 'room_not_found')
        return
      }
      this.status = 'reconnecting'
      this.retryTimer = setTimeout(() => this.connect(), RETRY_DELAYS[this.attempts++])
    }
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.playerId = msg.playerId
        this.status = 'open'
        this.setRoom(msg.room)
        break
      case 'room':
        this.setRoom(msg.room)
        break
      case 'game':
        this.deadline = msg.deadline
        this.waitingOn = msg.waitingOn
        this.receive(msg.view, msg.events)
        break
      case 'gameStopped':
        this.view = null
        this.heldRound = null
        break
      case 'taunt':
        sound.taunt(msg.id)
        if (msg.seat === null) this.shout(AUDIENCE, `${msg.nick}: ${tauntText(msg.id)}`)
        else this.shout(msg.seat, tauntText(msg.id))
        break
      case 'error':
        // An error before welcome ends the attempt (wrong password, banned, room closed).
        if (this.status !== 'open') this.endReason = msg.code
        else this.toast(msg.code)
        break
      case 'kicked':
      case 'closed':
        this.endReason = msg.t
        break
      case 'pong':
        break
    }
  }

  private setRoom(room: RoomSnapshot): void {
    this.room = room
    // Converts the track start to this browser's clock.
    const skew = Date.now() - room.serverTime
    const { trackId, startedAt } = room.jukebox
    if (
      trackId !== this.jukebox.trackId ||
      (startedAt && startedAt + skew !== this.jukebox.startedAt)
    ) {
      this.jukebox = { trackId, startedAt: startedAt === null ? null : startedAt + skew }
    }
    this.avatars = room.seats.map((seat) =>
      seat.kind === 'human'
        ? (room.players.find((p) => p.id === seat.playerId)?.avatar ?? null)
        : null,
    )
    this.names = room.seats.map((seat) => {
      if (seat.kind === 'bot') return seat.name
      if (seat.kind === 'human') return room.players.find((p) => p.id === seat.playerId)?.nick ?? ''
      return ''
    })
  }

  private toast(code: ErrorCode): void {
    this.error = code
    clearTimeout(this.errorTimer)
    this.errorTimer = setTimeout(() => (this.error = null), ERROR_TOAST_MS)
  }

  private finish(reason: EndReason): void {
    this.status = 'closed'
    this.endReason = reason
    clearTimeout(this.retryTimer)
    this.ws?.close(1000)
    this.ws = null
  }
}
