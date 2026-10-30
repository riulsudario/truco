import type { LobbyMessage, RoomSettings, ServerMessage } from '@truco/protocol'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

const BASE = 'https://truco.test'
const settings = (patch: Partial<RoomSettings> = {}): RoomSettings => ({
  name: 'Mesa de teste',
  visibility: 'publica',
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

/** Abre um WebSocket e devolve um leitor que espera a próxima mensagem que casar. */
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
  it('cria sala, consulta pelo código e recusa código inexistente', async () => {
    const code = await createRoom('token-criador-aaaaaa')
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/)
    const info = await SELF.fetch(`${BASE}/api/rooms/${code.toLowerCase()}`)
    expect(await info.json()).toEqual({ code, name: 'Mesa de teste', hasPassword: false })
    expect((await SELF.fetch(`${BASE}/api/rooms/ZZZZ`)).status).toBe(404)
  })

  it('limita quantas salas um mesmo IP cria em pouco tempo', async () => {
    const create = () =>
      SELF.fetch(`${BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify({ settings: settings(), token: 'token-limite-aaaaaa' }),
      })
    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await create()).status)
    expect(statuses.slice(0, 6)).toEqual([201, 201, 201, 201, 201, 201])
    expect(statuses[6]).toBe(429)
  })

  it('recusa criação com dados inválidos', async () => {
    const response = await SELF.fetch(`${BASE}/api/rooms`, {
      method: 'POST',
      body: JSON.stringify({ settings: settings({ name: '' }), token: 'curto' }),
    })
    expect(response.status).toBe(400)
  })

  it('entra pela WebSocket, vira dono e começa a partida', async () => {
    const code = await createRoom('token-criador-bbbbbb')
    const player = await connect<ServerMessage>(`/ws/room/${code}`)
    player.send({ t: 'hello', nick: 'Riul', token: 'token-criador-bbbbbb' })
    const welcome = await player.next('welcome')
    expect(welcome.room.ownerId).toBe(welcome.playerId)

    player.send({ t: 'start' })
    const game = await player.next('game')
    expect(game.view.seat).toBe(0)
    expect(game.view.hand.myCards).toHaveLength(3)
    player.ws.close()
  })

  it('recusa visual de boneco com peça que não existe no catálogo', async () => {
    const code = await createRoom('token-criador-ffffff')
    const player = await connect<ServerMessage>(`/ws/room/${code}`)
    player.send({
      t: 'hello',
      nick: 'Riul',
      token: 'token-criador-ffffff',
      avatar: { hair: 'moicano-de-fogo' },
    })
    expect(await player.next('error')).toEqual({ t: 'error', code: 'invalid_message' })
    player.ws.close()
  })

  it('mensagem fora do protocolo volta como erro', async () => {
    const code = await createRoom('token-criador-cccccc')
    const player = await connect<ServerMessage>(`/ws/room/${code}`)
    player.send({ t: 'hackear', tudo: true })
    expect(await player.next('error')).toEqual({ t: 'error', code: 'invalid_message' })
    player.ws.close()
  })

  it('lobby lista sala pública e esconde a privada', async () => {
    const lobby = await connect<LobbyMessage>('/ws/lobby')
    await lobby.next('rooms')
    const publicCode = await createRoom('token-criador-dddddd', { name: 'Aberta' })
    const privateCode = await createRoom('token-criador-eeeeee', { visibility: 'privada' })

    let rooms = (await lobby.next('rooms')).rooms
    while (!rooms.some((r) => r.code === publicCode)) rooms = (await lobby.next('rooms')).rooms
    expect(rooms.find((r) => r.code === publicCode)).toMatchObject({ name: 'Aberta', humans: 0 })
    expect(rooms.some((r) => r.code === privateCode)).toBe(false)
    lobby.ws.close()
  })
})
