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
/** Pausa extra depois de uma vaza fechar, para todo mundo ver as quatro cartas. */
export const ROUND_HOLD_MS = 1_300
export const BOT_DELAY_MS = [450, 950] as const
export const EMPTY_CLOSE_MS = 5 * 60_000
/**
 * Em produção o alarme do Durable Object às vezes dispara uns milissegundos antes do
 * horário marcado; dentro dessa folga ele conta como vencido.
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

/** Tudo que a sala guarda. Serializável: é o que vai para o storage do Durable Object. */
export interface RoomData {
  code: string
  settings: RoomSettings
  /** Token de quem criou a sala; vira dono ao entrar. */
  creatorToken: string
  ownerId: string | null
  players: StoredPlayer[]
  seats: SeatInfo[]
  banned: string[]
  game: GameState | null
  timer: Timer | null
  emptySince: number | null
  /** Semente dos bots e das partidas novas. */
  seed: number
  /** Música da sala, igual para todo mundo. */
  jukebox?: JukeboxState
  /** Última provocação de cada cadeira de bot (epoch ms). */
  botTauntAt?: number[]
  closed: boolean
}

export type Outgoing =
  | { to: string; msg: ServerMessage }
  /** Envia a mensagem e fecha a conexão do jogador. */
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
    seats: SEATS.map(() => ({ kind: 'vazia' })),
    banned: [],
    game: null,
    timer: null,
    emptySince: now,
    seed,
    closed: false,
  }
}

/**
 * Regras da sala: quem entra, quem senta, quem manda, quando os bots jogam. Não conhece
 * WebSocket nem storage; o Durable Object entrega mensagens e despacha o que sai daqui.
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
      const free = data.game ? -1 : data.seats.findIndex((s) => s.kind === 'vazia')
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
      // Quem voltou pode estar na vez: tira o bot de cena e devolve o relógio.
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
    // Se era a vez dele, o bot assume sem esperar o relógio.
    if (this.data.game) this.schedule(false, true)
  }

  /** Executa o que venceu: jogada de bot, tempo esgotado, próxima mão ou sala vazia. */
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
      status: data.game ? 'jogando' : 'esperando',
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
      status: data.game ? 'jogando' : 'esperando',
      hasPassword: Boolean(data.settings.password),
    }
  }

  // ---- sala -----------------------------------------------------------------------------

  private sit(player: StoredPlayer, seat: Seat): void {
    if (this.data.game) return this.error(player, 'game_running')
    if (this.data.seats[seat]!.kind !== 'vazia') return this.error(player, 'seat_taken')
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

  /** Dono troca alguém de cadeira (ou manda assistir). Quem estava no destino troca de lugar. */
  private move(owner: StoredPlayer, targetId: string, seat: Seat | null): void {
    if (this.data.game) return this.error(owner, 'game_running')
    const target = this.player(targetId)
    if (!target) return this.error(owner, 'player_not_found')
    if (seat === null) {
      this.unseat(target)
      return this.broadcastRoom()
    }
    const from = target.seat
    const occupant = this.data.seats[seat]!
    this.data.seats[seat] = { kind: 'humano', playerId: target.id }
    target.seat = seat
    if (from !== null) this.data.seats[from] = { kind: 'vazia' }

    if (occupant.kind === 'humano') {
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
      if (current.kind !== 'vazia') return this.error(owner, 'seat_taken')
      this.data.seats[seat] = { kind: 'bot', name: this.botName() }
    } else {
      if (current.kind !== 'bot') return this.error(owner, 'seat_taken')
      this.data.seats[seat] = { kind: 'vazia' }
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
      // No meio da partida a cadeira não pode ficar vazia: um bot assume de vez.
      data.seats[player.seat] = data.game
        ? { kind: 'bot', name: `${player.nick} (bot)` }
        : { kind: 'vazia' }
    }
    data.players = data.players.filter((p) => p.id !== player.id)
    if (data.ownerId === player.id) data.ownerId = this.oldestConnected()?.id ?? null
    if (!data.players.some((p) => p.connected)) data.emptySince = this.now()
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

  // ---- partida --------------------------------------------------------------------------

  private start(owner: StoredPlayer): void {
    const { data } = this
    if (data.game && data.game.phase !== 'gameOver') return this.error(owner, 'game_running')
    for (const seat of SEATS) {
      if (data.seats[seat]!.kind === 'vazia')
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

  /** No máximo um bot provoca por lance, respeitando o intervalo de cada um. */
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
   * Decide quem age a seguir e quando: humano conectado tem relógio, bot age logo.
   * keepClock preserva o relógio em curso quando só mudou quem está conectado.
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
      // Bot na vez (ou bot da dupla respondendo truco junto com um humano) age logo.
      const [min, max] = BOT_DELAY_MS
      this.data.timer = { kind: 'act', at: now + hold + min + this.random() * (max - min) }
    } else {
      const keep = keepClock && this.data.timer?.kind === 'timeout' && this.data.timer.at > now
      this.data.timer = keep ? this.data.timer : { kind: 'timeout', at: now + hold + TURN_MS }
    }
  }

  /** Cadeira que o bot vai jogar: no timeout, a do humano que demorou; senão a do bot. */
  private autoSeat(kind: Timer['kind']): Seat | undefined {
    const seats = seatsToAct(this.data.game!)
    if (kind === 'timeout') return seats.find((seat) => this.humanAt(seat)?.connected)
    return seats.find((seat) => !this.humanAt(seat)?.connected)
  }

  /**
   * Qualquer um na sala escolhe a música, como numa jukebox de bar. O pedido com `after`
   * é o aviso de que a faixa acabou: vários chegam juntos, só o primeiro troca.
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

  // ---- utilitários ----------------------------------------------------------------------

  private player(id: string): StoredPlayer | undefined {
    return this.data.players.find((p) => p.id === id)
  }

  private humanAt(seat: Seat): StoredPlayer | undefined {
    const info = this.data.seats[seat]
    return info?.kind === 'humano' ? this.player(info.playerId) : undefined
  }

  private seatPlayer(player: StoredPlayer, seat: Seat): void {
    this.data.seats[seat] = { kind: 'humano', playerId: player.id }
    player.seat = seat
  }

  private unseat(player: StoredPlayer): void {
    if (player.seat !== null) this.data.seats[player.seat] = { kind: 'vazia' }
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
