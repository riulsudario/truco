import type { LobbyMessage, RoomSettings, ServerMessage } from '@truco/protocol'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const BASE = 'https://truco.test'
const settings = (patch: Partial<RoomSettings> = {}): RoomSettings => ({
  name: 'Test table',
  visibility: 'public',
  password: null,
  difficulty: 'normal',
  ...patch,
})

async function createRoom(token: string, patch: Partial<RoomSettings> = {}): Promise<string> {
  const response = await SELF.fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    body: JSON.stringify({ settings: settings(patch), token }),
  })
  expect(response.status).toBe(201)
  return ((await response.json()) as { code: string }).code
}

/** Opens a WebSocket and returns a reader that waits for the next matching message. */
async function connect<M extends { t: string }>(path: string) {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: { Upgrade: 'websocket' } })
  expect(response.status).toBe(101)
  const ws = response.webSocket!
  ws.accept()
  const queue: M[] = []
  const waiters: (() => void)[] = []
  ws.addEventListener('message', (event) => {
    queue.push(JSON.parse(event.data as string) as M)
    waiters.splice(0).forEach((wake) => wake())
  })
  async function next<T extends M['t']>(t: T): Promise<Extract<M, { t: T }>> {
    for (;;) {
      const index = queue.findIndex((m) => m.t === t)
      if (index >= 0) return queue.splice(index, 1)[0] as Extract<M, { t: T }>
      await new Promise<void>((resolve) => waiters.push(resolve))
    }
  }
  return { ws, next, send: (msg: unknown) => ws.send(JSON.stringify(msg)) }
}

describe('worker', () => {
  it('creates a room, looks it up by code and rejects an unknown code', async () => {
    const code = await createRoom('token-creator-aaaaaa')
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/)
    const info = await SELF.fetch(`${BASE}/api/rooms/${code.toLowerCase()}`)
    expect(await info.json()).toEqual({ code, name: 'Test table', hasPassword: false })
    expect((await SELF.fetch(`${BASE}/api/rooms/ZZZZ`)).status).toBe(404)
  })

  it('limits how many rooms the same IP creates in a short time', async () => {
    const create = () =>
      SELF.fetch(`${BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify({ settings: settings(), token: 'token-limit-aaaaaa' }),
      })
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await create()).status)
    expect(statuses.slice(0, 6)).toEqual([201, 201, 201, 201, 201, 201])
    expect(statuses[6]).toBe(429)
  })

  it('rejects creation with invalid data', async () => {
    const response = await SELF.fetch(`${BASE}/api/rooms`, {
      method: 'POST',
      body: JSON.stringify({ settings: settings({ name: '' }), token: 'short' }),
    })
    expect(response.status).toBe(400)
  })

  it('joins through the WebSocket, becomes owner and starts the game', async () => {
    const code = await createRoom('token-creator-bbbbbb')
    const player = await connect<ServerMessage>(`/ws/room/${code}`)
    player.send({ t: 'hello', nick: 'Riul', token: 'token-creator-bbbbbb' })
    const welcome = await player.next('welcome')
    expect(welcome.room.ownerId).toBe(welcome.playerId)

    player.send({ t: 'start' })
    const game = await player.next('game')
    expect(game.view.seat).toBe(0)
    expect(game.view.hand.myCards).toHaveLength(3)
    player.ws.close()
  })

  it('rejects an avatar with a part that is not in the catalog', async () => {
    const code = await createRoom('token-creator-ffffff')
    const player = await connect<ServerMessage>(`/ws/room/${code}`)
    player.send({
      t: 'hello',
      nick: 'Riul',
      token: 'token-creator-ffffff',
      avatar: { hair: 'flaming-mohawk' },
    })
    expect(await player.next('error')).toEqual({ t: 'error', code: 'invalid_message' })
    player.ws.close()
  })

  it('a message outside the protocol comes back as an error', async () => {
    const code = await createRoom('token-creator-cccccc')
    const player = await connect<ServerMessage>(`/ws/room/${code}`)
    player.send({ t: 'hack', everything: true })
    expect(await player.next('error')).toEqual({ t: 'error', code: 'invalid_message' })
    player.ws.close()
  })

  it('the lobby lists the public room and hides the private one', async () => {
    const lobby = await connect<LobbyMessage>('/ws/lobby')
    await lobby.next('rooms')
    const publicCode = await createRoom('token-creator-dddddd', { name: 'Open' })
    const privateCode = await createRoom('token-creator-eeeeee', { visibility: 'private' })

    let rooms = (await lobby.next('rooms')).rooms
    while (!rooms.some((r) => r.code === publicCode)) rooms = (await lobby.next('rooms')).rooms
    expect(rooms.find((r) => r.code === publicCode)).toMatchObject({ name: 'Open', humans: 0 })
    expect(rooms.some((r) => r.code === privateCode)).toBe(false)
    lobby.ws.close()
  })
})
