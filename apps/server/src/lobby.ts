import type { LobbyMessage, RoomSummary } from '@truco/protocol'
import { DurableObject } from 'cloudflare:workers'
import type { Env } from './env'

/** Single instance holding the list of public rooms, pushed live to whoever is watching. */
/** How many rooms the same IP can create per time window. */
export const ROOM_CREATION_LIMIT = { max: 6, windowMs: 10 * 60_000 }

export class Lobby extends DurableObject<Env> {
  private rooms = new Map<string, RoomSummary>()
  /** Times of the latest creations per IP; memory only, enough to curb abuse. */
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

  /** Records a room creation; false if the IP went over the limit. */
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
      return new Response('expected WebSocket', { status: 426 })
    }
    const { 0: client, 1: server } = new WebSocketPair()
    this.ctx.acceptWebSocket(server)
    server.send(JSON.stringify(this.message()))
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(): Promise<void> {
    // The lobby only broadcasts; nothing to do with what comes in.
  }

  private async publish(): Promise<void> {
    await this.ctx.storage.put('rooms', [...this.rooms.values()])
    const payload = JSON.stringify(this.message())
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload)
      } catch {
        // connection dropping
      }
    }
  }

  private message(): LobbyMessage {
    return { t: 'rooms', rooms: this.sorted() }
  }

  /** Rooms waiting for people first, then the fullest ones. */
  private sorted(): RoomSummary[] {
    return [...this.rooms.values()].sort(
      (a, b) =>
        Number(a.status === 'playing') - Number(b.status === 'playing') || b.humans - a.humans,
    )
  }
}
