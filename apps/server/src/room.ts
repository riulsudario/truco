import { parseClientMessage, type RoomSettings, type ServerMessage } from '@truco/protocol'
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'
import { createRoomData, RoomCore, type RoomData } from './room-core'

interface Attachment {
  playerId: string | null
}

/**
 * Uma sala = um Durable Object. Usa WebSocket Hibernation: entre mensagens o objeto pode
 * dormir; o estado volta do storage e as conexões continuam abertas.
 */
export class Room extends DurableObject<Env> {
  private core: RoomCore | null = null
  private lastSummary = ''

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      const data = await ctx.storage.get<RoomData>('room')
      if (data) this.core = new RoomCore(data, Date.now)
    })
  }

  /** Inicializa a sala. Falso se o código já está em uso. */
  async create(code: string, settings: RoomSettings, creatorToken: string): Promise<boolean> {
    if (this.core) return false
    this.core = new RoomCore(
      createRoomData(code, settings, creatorToken, seed(this.env), Date.now()),
      Date.now,
    )
    await this.flush()
    return true
  }

  async info(): Promise<{ name: string; hasPassword: boolean } | null> {
    if (!this.core) return null
    const { name, hasPassword } = this.core.snapshot()
    return { name, hasPassword }
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('esperava WebSocket', { status: 426 })
    }
    if (!this.core) return new Response('sala não encontrada', { status: 404 })
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ playerId: null } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const core = this.core
    if (!core) {
      send(ws, { t: 'error', code: 'room_not_found' })
      ws.close(4004, 'room_not_found')
      return
    }
    const msg = parseClientMessage(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    if (!msg) {
      send(ws, { t: 'error', code: 'invalid_message' })
      return
    }

    const { playerId } = attachment(ws)
    if (msg.t === 'hello') {
      const result = core.join(msg)
      if (!result.ok) {
        send(ws, { t: 'error', code: result.error })
        ws.close(4001, result.error)
        return
      }
      // Uma conexão por jogador: a aba antiga cede lugar à nova.
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && attachment(other).playerId === result.playerId) {
          other.serializeAttachment({ playerId: null } satisfies Attachment)
          other.close(4000, 'replaced')
        }
      }
      ws.serializeAttachment({ playerId: result.playerId } satisfies Attachment)
    } else if (!playerId) {
      send(ws, { t: 'error', code: 'not_joined' })
      return
    } else {
      core.handle(playerId, msg)
    }
    await this.flush()
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.dropSocket(ws)
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropSocket(ws)
  }

  override async alarm(): Promise<void> {
    if (!this.core) return
    this.core.alarm()
    await this.flush()
  }

  private async dropSocket(ws: WebSocket): Promise<void> {
    const { playerId } = attachment(ws)
    if (!this.core || !playerId) return
    const stillThere = this.ctx
      .getWebSockets()
      .some((other) => other !== ws && attachment(other).playerId === playerId)
    if (!stillThere) {
      this.core.disconnect(playerId)
      await this.flush()
    }
  }

  /** Entrega as mensagens geradas, persiste, reprograma o alarme e avisa o lobby. */
  private async flush(): Promise<void> {
    const core = this.core!
    const sockets = new Map<string, WebSocket>()
    for (const ws of this.ctx.getWebSockets()) {
      const { playerId } = attachment(ws)
      if (playerId) sockets.set(playerId, ws)
    }
    for (const item of core.drain()) {
      if ('to' in item) {
        const ws = sockets.get(item.to)
        if (ws) send(ws, item.msg)
      } else {
        const ws = sockets.get(item.close)
        if (ws) {
          send(ws, item.msg)
          ws.serializeAttachment({ playerId: null } satisfies Attachment)
          ws.close(4002, item.msg.t)
        }
      }
    }

    if (core.data.closed) {
      this.core = null
      await this.syncLobby(core, true)
      await this.ctx.storage.deleteAlarm()
      await this.ctx.storage.deleteAll()
      return
    }

    await this.ctx.storage.put('room', core.data)
    const alarm = core.nextAlarm()
    // Nunca no passado: um alarme para um horário que já passou pode não disparar de novo.
    if (alarm === null) await this.ctx.storage.deleteAlarm()
    else await this.ctx.storage.setAlarm(Math.max(alarm, Date.now() + 10))
    await this.syncLobby(core)
  }

  /** Mantém a lista pública em dia; sala privada ou fechada sai da lista. */
  private async syncLobby(core: RoomCore, closed = false): Promise<void> {
    const listed = !closed && core.data.settings.visibility === 'publica'
    const summary = listed ? JSON.stringify(core.summary()) : ''
    // Depois de hibernar não sabemos o que o lobby tem; na dúvida, manda de novo.
    if (summary === this.lastSummary && this.lastSummary !== '') return
    this.lastSummary = summary
    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('lobby'))
    if (listed) await lobby.upsert(core.summary())
    else await lobby.remove(core.data.code)
  }
}

function attachment(ws: WebSocket): Attachment {
  return (ws.deserializeAttachment() as Attachment | null) ?? { playerId: null }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // conexão já fechando; o close handler cuida do resto
  }
}

function seed(env: Env): number {
  if (env.TRUCO_SEED) return Number(env.TRUCO_SEED)
  return crypto.getRandomValues(new Uint32Array(1))[0]! | 0
}
