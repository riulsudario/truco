import { BOT_TAUNT_COOLDOWN_MS, decide, tauntReaction } from '@truco/bots'
import {
  newGame,
  nextRandom,
  reduce,
  seatsToAct,
  toPlayerView,
  type Action,
  type GameEvent,
  type GameState,
  type Seat,
} from '@truco/engine'
import {
  JUKEBOX_COOLDOWN_MS,
  TAUNT_COOLDOWN_MS,
  type ClientMessage,
  type ErrorCode,
  type PlayerInfo,
  type RoomSettings,
  type RoomSnapshot,
  type RoomSummary,
  type SeatInfo,
  type ServerMessage,
  type JukeboxState,
  type TauntId,
  type TrackId,
} from '@truco/protocol'

export const TURN_MS = 20_000
export const NEXT_HAND_MS = 2_600
/** Extra pause after a round closes, so everyone sees the four cards. */
export const ROUND_HOLD_MS = 1_300
export const BOT_DELAY_MS = [450, 950] as const
/** How long a room whose people all dropped (not left) waits for someone to come back. */
export const EMPTY_CLOSE_MS = 30_000
/**
 * In production the Durable Object alarm sometimes fires a few milliseconds before the
 * scheduled time; within this slack it counts as due.
 */
export const ALARM_SLACK_MS = 100

const BOT_NAMES = ['Tonhão', 'Dona Cida', 'Zé do Bar', 'Seu Lunga', 'Tia Neide', 'Pé de Pano']
const SEATS: Seat[] = [0, 1, 2, 3]

interface StoredPlayer extends PlayerInfo {
  token: string
  joinedAt: number
  lastTauntAt: number
  lastJukeboxAt?: number
}

interface Timer {
  kind: 'act' | 'timeout' | 'nextHand'
  at: number
}

/** Everything the room keeps. Serializable: it is what goes into the Durable Object storage. */
export interface RoomData {
  code: string
  settings: RoomSettings
  /** Token of whoever created the room; they become the owner on joining. */
  creatorToken: string
  ownerId: string | null
  players: StoredPlayer[]
  seats: SeatInfo[]
  banned: string[]
  game: GameState | null
  timer: Timer | null
  emptySince: number | null
  /** Seed for the bots and new games. */
  seed: number
  /** The room's music, the same for everyone. */
  jukebox?: JukeboxState
  /** Last taunt from each bot seat (epoch ms). */
  botTauntAt?: number[]
  closed: boolean
}

export type Outgoing =
  | { to: string; msg: ServerMessage }
  /** Sends the message and closes the player's connection. */
  | { close: string; msg: ServerMessage }

export type JoinResult = { ok: true; playerId: string } | { ok: false; error: ErrorCode }

type HelloMessage = Extract<ClientMessage, { t: 'hello' }>

export function createRoomData(
  code: string,
  settings: RoomSettings,
  creatorToken: string,
  seed: number,
  now: number,
): RoomData {
  return {
    code,
    settings,
    creatorToken,
    ownerId: null,
    players: [],
    seats: SEATS.map(() => ({ kind: 'empty' })),
    banned: [],
    game: null,
    timer: null,
    emptySince: now,
    seed,
    closed: false,
  }
}

/**
 * Room rules: who joins, who sits, who is in charge, when the bots play. It knows nothing
 * about WebSockets or storage; the Durable Object delivers messages and dispatches what comes out.
 */
export class RoomCore {
  private out: Outgoing[] = []

  constructor(
    readonly data: RoomData,
    private readonly now: () => number,
  ) {}

  join(hello: HelloMessage): JoinResult {
    const { data } = this
    if (data.closed) return { ok: false, error: 'room_closed' }
    if (data.banned.includes(hello.token)) return { ok: false, error: 'banned' }

    let player = data.players.find((p) => p.token === hello.token)
    if (!player) {
      const isCreator = hello.token === data.creatorToken
      if (data.settings.password && !isCreator && hello.password !== data.settings.password) {
        return { ok: false, error: 'bad_password' }
      }
      const free = data.game ? -1 : data.seats.findIndex((s) => s.kind === 'empty')
      if (free < 0 && !this.spectatorsAllowed && !isCreator) {
        return { ok: false, error: 'no_spectators' }
      }
      player = {
        id: this.newId(),
        token: hello.token,
        nick: hello.nick,
        avatar: hello.avatar ?? null,
        seat: null,
        connected: true,
        ready: false,
        joinedAt: this.now(),
        lastTauntAt: 0,
      }
      data.players.push(player)
      if (free >= 0) this.seatPlayer(player, free as Seat)
      if (isCreator || data.ownerId === null) data.ownerId = player.id
    }

    player.nick = hello.nick
    if (hello.avatar) player.avatar = hello.avatar
    player.connected = true
    data.emptySince = null
    this.send(player.id, { t: 'welcome', playerId: player.id, room: this.snapshot() })
    this.broadcastRoom()
    if (data.game) {
      // Whoever came back may be on turn: take the bot out and give the clock back.
      this.schedule(false, true)
      this.send(player.id, this.gameMessage(player, []))
    }
    return { ok: true, playerId: player.id }
  }

  handle(playerId: string, msg: ClientMessage): void {
    const player = this.player(playerId)
    if (!player) return this.send(playerId, { t: 'error', code: 'not_joined' })

    switch (msg.t) {
      case 'hello':
        return
      case 'ping':
        return this.send(playerId, { t: 'pong' })
      case 'taunt':
        return this.taunt(player, msg.id)
      case 'jukebox':
        return this.jukebox(player, msg.trackId, msg.after)
      case 'game':
        return this.playerAction(player, msg.action)
      case 'leave':
        return this.removePlayer(player)
      case 'ready':
        player.ready = msg.ready
        return this.broadcastRoom()
      case 'sit':
        return this.sit(player, msg.seat)
      case 'stand':
        if (this.data.game) return this.error(player, 'game_running')
        if (!this.spectatorsAllowed) return this.error(player, 'no_spectators')
        this.unseat(player)
        return this.broadcastRoom()
    }

    if (player.id !== this.data.ownerId) return this.error(player, 'not_owner')
    switch (msg.t) {
      case 'settings':
        return this.updateSettings(msg.settings)
      case 'move':
        return this.move(player, msg.playerId, msg.seat)
      case 'bot':
        return this.toggleBot(player, msg.seat, msg.add)
      case 'kick':
        return this.kick(player, msg.playerId)
      case 'owner':
        return this.transferOwner(player, msg.playerId)
      case 'start':
        return this.start(player)
      case 'stop':
        return this.stop(player)
      case 'close':
        return this.close()
    }
  }

  disconnect(playerId: string): void {
    const player = this.player(playerId)
    if (!player) return
    player.connected = false
    if (!this.data.players.some((p) => p.connected)) this.data.emptySince = this.now()
    if (this.data.ownerId === player.id) this.data.ownerId = this.oldestConnected()?.id ?? player.id
    this.broadcastRoom()
    // If it was their turn, the bot takes over without waiting for the clock.
    if (this.data.game) this.schedule(false, true)
  }

  /** Runs whatever is due: a bot move, a timeout, the next hand or an empty room. */
  alarm(): void {
    const now = this.now()
    const { data } = this
    if (data.closed) return
    if (data.emptySince !== null && now + ALARM_SLACK_MS - data.emptySince >= EMPTY_CLOSE_MS) {
      this.close()
      return
    }
    const timer = data.timer
    if (!timer || now + ALARM_SLACK_MS < timer.at || !data.game) return
    data.timer = null

    if (timer.kind === 'nextHand') {
      this.applyAction({ type: 'nextHand' })
      return
    }
    const seat = this.autoSeat(timer.kind)
    if (seat === undefined) return
    const action = decide({
      view: toPlayerView(data.game, seat),
      random: () => this.random(),
      difficulty: data.settings.difficulty,
    })
    this.applyAction(action)
  }

  nextAlarm(): number | null {
    if (this.data.closed) return null
    const times = [
      this.data.timer?.at,
      this.data.emptySince === null ? undefined : this.data.emptySince + EMPTY_CLOSE_MS,
    ].filter((t): t is number => t !== undefined)
    return times.length ? Math.min(...times) : null
  }

  drain(): Outgoing[] {
    const out = this.out
    this.out = []
    return out
  }

  snapshot(): RoomSnapshot {
    const { data } = this
    return {
      code: data.code,
      name: data.settings.name,
      ownerId: data.ownerId,
      visibility: data.settings.visibility,
      hasPassword: Boolean(data.settings.password),
      difficulty: data.settings.difficulty,
      spectators: this.spectatorsAllowed,
      status: data.game ? 'playing' : 'waiting',
      jukebox: data.jukebox ?? { trackId: null, startedAt: null },
      serverTime: this.now(),
      seats: data.seats,
      players: data.players.map(({ id, nick, avatar, seat, connected, ready }) => ({
        id,
        nick,
        avatar,
        seat,
        connected,
        ready,
      })),
    }
  }

  summary(): RoomSummary {
    const { data } = this
    return {
      code: data.code,
      name: data.settings.name,
      humans: data.players.filter((p) => p.connected).length,
      bots: data.seats.filter((s) => s.kind === 'bot').length,
      status: data.game ? 'playing' : 'waiting',
      hasPassword: Boolean(data.settings.password),
      spectators: this.spectatorsAllowed,
    }
  }

  /** Settings stored before the option existed have no flag: those rooms allow watching. */
  private get spectatorsAllowed(): boolean {
    return this.data.settings.spectators !== false
  }

  // ---- room -----------------------------------------------------------------------------

  private sit(player: StoredPlayer, seat: Seat): void {
    if (this.data.game) return this.error(player, 'game_running')
    if (this.data.seats[seat]!.kind !== 'empty') return this.error(player, 'seat_taken')
    this.unseat(player)
    this.seatPlayer(player, seat)
    this.broadcastRoom()
  }

  private updateSettings(settings: Partial<RoomSettings>): void {
    const next = { ...this.data.settings, ...settings }
    if (next.password === '') next.password = null
    this.data.settings = next
    this.broadcastRoom()
  }

  /** The owner moves someone to another seat (or to watching). Whoever was there swaps places. */
  private move(owner: StoredPlayer, targetId: string, seat: Seat | null): void {
    if (this.data.game) return this.error(owner, 'game_running')
    const target = this.player(targetId)
    if (!target) return this.error(owner, 'player_not_found')
    if (seat === null) {
      if (!this.spectatorsAllowed) return this.error(owner, 'no_spectators')
      this.unseat(target)
      return this.broadcastRoom()
    }
    const from = target.seat
    const occupant = this.data.seats[seat]!
    this.data.seats[seat] = { kind: 'human', playerId: target.id }
    target.seat = seat
    if (from !== null) this.data.seats[from] = { kind: 'empty' }

    if (occupant.kind === 'human') {
      const displaced = this.player(occupant.playerId)!
      displaced.seat = null
      if (from !== null) this.seatPlayer(displaced, from)
    } else if (occupant.kind === 'bot' && from !== null) {
      this.data.seats[from] = occupant
    }
    this.broadcastRoom()
  }

  private toggleBot(owner: StoredPlayer, seat: Seat, add: boolean): void {
    if (this.data.game) return this.error(owner, 'game_running')
    const current = this.data.seats[seat]!
    if (add) {
      if (current.kind !== 'empty') return this.error(owner, 'seat_taken')
      this.data.seats[seat] = { kind: 'bot', name: this.botName() }
    } else {
      if (current.kind !== 'bot') return this.error(owner, 'seat_taken')
      this.data.seats[seat] = { kind: 'empty' }
    }
    this.broadcastRoom()
  }

  private kick(owner: StoredPlayer, targetId: string): void {
    const target = this.player(targetId)
    if (!target || target.id === owner.id) return this.error(owner, 'player_not_found')
    this.data.banned.push(target.token)
    this.out.push({ close: target.id, msg: { t: 'kicked' } })
    this.removePlayer(target)
  }

  private transferOwner(owner: StoredPlayer, targetId: string): void {
    const target = this.player(targetId)
    if (!target || !target.connected) return this.error(owner, 'player_not_found')
    this.data.ownerId = target.id
    this.broadcastRoom()
  }

  private removePlayer(player: StoredPlayer): void {
    const { data } = this
    if (player.seat !== null) {
      // Mid-game the seat can't be left empty: a bot takes over for good.
      data.seats[player.seat] = data.game
        ? { kind: 'bot', name: `${player.nick} (bot)` }
        : { kind: 'empty' }
    }
    data.players = data.players.filter((p) => p.id !== player.id)
    if (data.ownerId === player.id) data.ownerId = this.oldestConnected()?.id ?? null
    // The last person to leave closes the room.
    if (!data.players.some((p) => p.connected)) return this.close()
    this.broadcastRoom()
    if (data.game) this.schedule(false, true)
  }

  private close(): void {
    this.data.closed = true
    this.data.timer = null
    this.data.emptySince = null
    for (const player of this.data.players) {
      this.out.push({ close: player.id, msg: { t: 'closed' } })
    }
  }

  // ---- game -----------------------------------------------------------------------------

  private start(owner: StoredPlayer): void {
    const { data } = this
    if (data.game && data.game.phase !== 'gameOver') return this.error(owner, 'game_running')
    for (const seat of SEATS) {
      if (data.seats[seat]!.kind === 'empty')
        data.seats[seat] = { kind: 'bot', name: this.botName() }
    }
    const seed = Math.floor(this.random() * 2 ** 31)
    data.game = newGame({ seed, dealer: Math.floor(this.random() * 4) as Seat })
    this.broadcastRoom()
    this.broadcastGame([
      { type: 'handStarted', number: 1, dealer: data.game.hand.dealer, kind: data.game.hand.kind },
    ])
  }

  private stop(owner: StoredPlayer): void {
    if (!this.data.game) return this.error(owner, 'no_game')
    this.data.game = null
    this.data.timer = null
    for (const player of this.data.players) this.send(player.id, { t: 'gameStopped' })
    this.broadcastRoom()
  }

  private playerAction(
    player: StoredPlayer,
    action: Extract<ClientMessage, { t: 'game' }>['action'],
  ) {
    if (!this.data.game) return this.error(player, 'no_game')
    if (player.seat === null) return this.error(player, 'not_seated')
    const error = this.applyAction({ ...action, seat: player.seat } as Action)
    if (error) this.error(player, error)
  }

  private applyAction(action: Action): ErrorCode | null {
    const result = reduce(this.data.game!, action)
    if (!result.ok) return result.error
    this.data.game = result.state
    this.broadcastGame(result.events)
    return null
  }

  private broadcastGame(events: GameEvent[]): void {
    const roundClosed = events.some((e) => e.type === 'roundEnded')
    this.schedule(roundClosed)
    for (const player of this.data.players) {
      if (player.connected) this.send(player.id, this.gameMessage(player, events))
    }
    this.botTaunts(events)
  }

  /** At most one bot taunts per move, respecting each one's cooldown. */
  private botTaunts(events: GameEvent[]): void {
    const now = this.now()
    const last = (this.data.botTauntAt ??= [0, 0, 0, 0])
    for (const seat of SEATS) {
      const info = this.data.seats[seat]!
      if (info.kind !== 'bot' || now - last[seat]! < BOT_TAUNT_COOLDOWN_MS) continue
      const id = tauntReaction(events, seat, () => this.random())
      if (!id) continue
      last[seat] = now
      this.broadcastTaunt(seat, info.name, id)
      return
    }
  }

  private broadcastTaunt(seat: Seat | null, nick: string, id: TauntId): void {
    for (const p of this.data.players) {
      if (p.connected) this.send(p.id, { t: 'taunt', seat, nick, id })
    }
  }

  private gameMessage(player: StoredPlayer, events: GameEvent[]): ServerMessage {
    const game = this.data.game!
    const timer = this.data.timer
    return {
      t: 'game',
      view: toPlayerView(game, player.seat),
      events,
      deadline: timer?.kind === 'timeout' ? timer.at : null,
      waitingOn: seatsToAct(game),
    }
  }

  /**
   * Decides who acts next and when: a connected human gets a clock, a bot acts right away.
   * keepClock keeps the running clock when only who is connected has changed.
   */
  private schedule(roundClosed: boolean, keepClock = false): void {
    const game = this.data.game
    const now = this.now()
    const hold = roundClosed ? ROUND_HOLD_MS : 0
    if (!game || game.phase === 'gameOver') {
      this.data.timer = null
    } else if (game.phase === 'handOver') {
      this.data.timer = { kind: 'nextHand', at: now + NEXT_HAND_MS }
    } else if (seatsToAct(game).some((seat) => !this.humanAt(seat)?.connected)) {
      // A bot on turn (or a bot answering truco alongside a human partner) acts right away.
      const [min, max] = BOT_DELAY_MS
      this.data.timer = { kind: 'act', at: now + hold + min + this.random() * (max - min) }
    } else {
      const keep = keepClock && this.data.timer?.kind === 'timeout' && this.data.timer.at > now
      this.data.timer = keep ? this.data.timer : { kind: 'timeout', at: now + hold + TURN_MS }
    }
  }

  /** Seat the bot will play: on timeout, the slow human's; otherwise the bot's own. */
  private autoSeat(kind: Timer['kind']): Seat | undefined {
    const seats = seatsToAct(this.data.game!)
    if (kind === 'timeout') return seats.find((seat) => this.humanAt(seat)?.connected)
    return seats.find((seat) => !this.humanAt(seat)?.connected)
  }

  /**
   * Anyone in the room picks the music, like a bar jukebox. A request with `after` is the
   * notice that the track ended: several arrive together, only the first one switches.
   */
  private jukebox(player: StoredPlayer, trackId: TrackId | null, after?: TrackId): void {
    const current = this.data.jukebox ?? { trackId: null, startedAt: null }
    if (after !== undefined) {
      if (current.trackId !== after) return
    } else {
      const now = this.now()
      if (now - (player.lastJukeboxAt ?? 0) < JUKEBOX_COOLDOWN_MS)
        return this.error(player, 'rate_limited')
      player.lastJukeboxAt = now
    }
    this.data.jukebox = { trackId, startedAt: trackId ? this.now() : null }
    this.broadcastRoom()
  }

  private taunt(player: StoredPlayer, id: TauntId): void {
    const now = this.now()
    if (now - player.lastTauntAt < TAUNT_COOLDOWN_MS) return this.error(player, 'rate_limited')
    player.lastTauntAt = now
    this.broadcastTaunt(player.seat, player.nick, id)
  }

  // ---- helpers --------------------------------------------------------------------------

  private player(id: string): StoredPlayer | undefined {
    return this.data.players.find((p) => p.id === id)
  }

  private humanAt(seat: Seat): StoredPlayer | undefined {
    const info = this.data.seats[seat]
    return info?.kind === 'human' ? this.player(info.playerId) : undefined
  }

  private seatPlayer(player: StoredPlayer, seat: Seat): void {
    this.data.seats[seat] = { kind: 'human', playerId: player.id }
    player.seat = seat
  }

  private unseat(player: StoredPlayer): void {
    if (player.seat !== null) this.data.seats[player.seat] = { kind: 'empty' }
    player.seat = null
  }

  private oldestConnected(): StoredPlayer | undefined {
    return this.data.players.filter((p) => p.connected).sort((a, b) => a.joinedAt - b.joinedAt)[0]
  }

  private botName(): string {
    const used = new Set(this.data.seats.flatMap((s) => (s.kind === 'bot' ? [s.name] : [])))
    return BOT_NAMES.find((name) => !used.has(name)) ?? `Bot ${used.size + 1}`
  }

  private random(): number {
    const [value, next] = nextRandom(this.data.seed)
    this.data.seed = next
    return value
  }

  private newId(): string {
    return Math.floor(this.random() * 36 ** 8)
      .toString(36)
      .padStart(8, '0')
  }

  private send(to: string, msg: ServerMessage): void {
    this.out.push({ to, msg })
  }

  private error(player: StoredPlayer, code: ErrorCode): void {
    this.send(player.id, { t: 'error', code })
  }

  private broadcastRoom(): void {
    const room = this.snapshot()
    for (const player of this.data.players) {
      if (player.connected) this.send(player.id, { t: 'room', room })
    }
  }
}
