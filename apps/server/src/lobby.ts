import type { LobbyMessage, RoomSummary } from '@truco/protocol'
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

/** Instância única com a lista de salas públicas, empurrada ao vivo para quem está olhando. */
/** Quantas salas um mesmo IP pode criar por janela de tempo. */
export const ROOM_CREATION_LIMIT = { max: 6, windowMs: 10 * 60_000 }

export class Lobby extends DurableObject<Env> {
  private rooms = new Map<string, RoomSummary>()
  /** Horários das últimas criações por IP; só em memória, basta para frear abuso. */
  private creations = new Map<string, number[]>()

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    void ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<RoomSummary[]>('rooms')
      for (const room of saved ?? []) this.rooms.set(room.code, room)
    })
  }

  async upsert(summary: RoomSummary): Promise<void> {
    this.rooms.set(summary.code, summary)
    await this.publish()
  }

  async remove(code: string): Promise<void> {
    if (!this.rooms.delete(code)) return
    await this.publish()
  }

  /** Registra uma criação de sala; falso se o IP passou do limite. */
  async allowCreate(ip: string, now = Date.now()): Promise<boolean> {
    const since = now - ROOM_CREATION_LIMIT.windowMs
    const recent = (this.creations.get(ip) ?? []).filter((at) => at > since)
    if (recent.length >= ROOM_CREATION_LIMIT.max) {
      this.creations.set(ip, recent)
      return false
    }
    this.creations.set(ip, [...recent, now])
    return true
  }

  async list(): Promise<RoomSummary[]> {
    return this.sorted()
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('esperava WebSocket', { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify(this.message()))
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(): Promise<void> {
    // O lobby só transmite; nada a fazer com o que chega.
  }

  private async publish(): Promise<void> {
    await this.ctx.storage.put('rooms', [...this.rooms.values()])
    const payload = JSON.stringify(this.message())
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload)
      } catch {
        // conexão caindo
      }
    }
  }

  private message(): LobbyMessage {
    return { t: 'rooms', rooms: this.sorted() }
  }

  /** Salas esperando gente primeiro, depois as mais cheias. */
  private sorted(): RoomSummary[] {
    return [...this.rooms.values()].sort(
      (a, b) =>
        Number(a.status === 'jogando') - Number(b.status === 'jogando') || b.humans - a.humans,
    )
  }
}
