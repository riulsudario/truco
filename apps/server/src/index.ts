import { CreateRoomSchema } from '@truco/protocol'
import * as v from 'valibot'
import type { Env } from './env'

export { Lobby } from './lobby'
export { Room } from './room'

/** Sem I e O para não confundir com 1 e 0 ao ditar o código. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const CODE_PATTERN = /^[A-HJ-NP-Z]{4}$/

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const roomPath = url.pathname.match(/^\/(api\/rooms|ws\/room)\/([A-Za-z]{4})$/)

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      return createRoom(request, env)
    }
    if (url.pathname === '/ws/lobby') {
      return env.LOBBY.get(env.LOBBY.idFromName('lobby')).fetch(request)
    }
    if (roomPath) {
      const code = roomPath[2]!.toUpperCase()
      if (!CODE_PATTERN.test(code)) return json({ error: 'room_not_found' }, 404)
      const room = env.ROOMS.get(env.ROOMS.idFromName(code))
      if (roomPath[1] === 'ws/room') return room.fetch(request)
      const info = await room.info()
      return info ? json({ code, ...info }) : json({ error: 'room_not_found' }, 404)
    }
    return json({ error: 'not_found' }, 404)
  },
} satisfies ExportedHandler<Env>

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = v.safeParse(CreateRoomSchema, await request.json().catch(() => null))
  if (!body.success) return json({ error: 'invalid_message' }, 400)

  // O link é aberto: limita quantas salas um mesmo IP cria, para ninguém lotar o lobby.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local'
  const lobby = env.LOBBY.get(env.LOBBY.idFromName('lobby'))
  if (!(await lobby.allowCreate(ip))) return json({ error: 'too_many_rooms' }, 429)

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode()
    const room = env.ROOMS.get(env.ROOMS.idFromName(code))
    if (await room.create(code, body.output.settings, body.output.token)) {
      return json({ code }, 201)
    }
  }
  return json({ error: 'try_again' }, 503)
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}
