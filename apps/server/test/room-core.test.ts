import { seatsToAct } from '@truco/engine'
import { DEFAULT_AVATAR, type RoomSettings, type ServerMessage } from '@truco/protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import { createRoomData, EMPTY_CLOSE_MS, RoomCore, TURN_MS, type Outgoing } from '../src/room-core'

const SETTINGS: RoomSettings = {
  name: 'Mesa do Riul',
  visibility: 'publica',
  password: null,
  difficulty: 'normal',
}
const CREATOR = 'token-do-criador-123'
const token = (n: number) => `token-jogador-${n}-xxxxxx`

let clock = 1_000_000
let room: RoomCore

function setup(settings: Partial<RoomSettings> = {}) {
  clock = 1_000_000
  room = new RoomCore(
    createRoomData('ABCD', { ...SETTINGS, ...settings }, CREATOR, 42, clock),
    () => clock,
  )
}

function join(nick: string, tok: string, password?: string) {
  const result = room.join({ t: 'hello', nick, token: tok, ...(password ? { password } : {}) })
  room.drain()
  if (!result.ok) throw new Error(result.error)
  return result.playerId
}

/** Mensagens enviadas a um jogador desde o último drain. */
function inbox(out: Outgoing[], playerId: string): ServerMessage[] {
  return out.flatMap((o) =>
    'to' in o ? (o.to === playerId ? [o.msg] : []) : o.close === playerId ? [o.msg] : [],
  )
}

/** Avança o relógio e dispara os alarmes vencidos, como o Durable Object faria. */
function advance(ms: number) {
  const target = clock + ms
  for (;;) {
    const next = room.nextAlarm()
    if (next === null || next > target) break
    clock = Math.max(clock, next)
    room.alarm()
  }
  clock = target
}

beforeEach(() => setup())

describe('entrar na sala', () => {
  it('criador vira dono e senta na primeira cadeira; o próximo senta na seguinte', () => {
    const owner = join('Riul', CREATOR)
    const guest = join('Ana', token(1))
    const snap = room.snapshot()
    expect(snap.ownerId).toBe(owner)
    expect(snap.seats[0]).toEqual({ kind: 'humano', playerId: owner })
    expect(snap.seats[1]).toEqual({ kind: 'humano', playerId: guest })
  })

  it('o estado público nunca carrega token nem senha', () => {
    setup({ password: 'segredo' })
    join('Riul', CREATOR)
    const json = JSON.stringify(room.snapshot())
    expect(json).not.toContain(CREATOR)
    expect(json).not.toContain('segredo')
    expect(room.snapshot().hasPassword).toBe(true)
  })

  it('senha errada não entra; criador e senha certa entram', () => {
    setup({ password: 'segredo' })
    expect(room.join({ t: 'hello', nick: 'X', token: token(1), password: 'chute' })).toEqual({
      ok: false,
      error: 'bad_password',
    })
    expect(() => join('Riul', CREATOR)).not.toThrow()
    expect(() => join('Ana', token(2), 'segredo')).not.toThrow()
  })

  it('guarda o visual do boneco e manda para a sala; reconectar pode trocar o visual', () => {
    const avatar = { ...DEFAULT_AVATAR, hair: 'blackpower' as const }
    const id = room.join({ t: 'hello', nick: 'Riul', token: CREATOR, avatar })
    expect(room.snapshot().players[0]?.avatar).toEqual(avatar)
    room.disconnect(id.ok ? id.playerId : '')
    room.join({ t: 'hello', nick: 'Riul', token: CREATOR, avatar: { ...avatar, hat: 'bandana' } })
    expect(room.snapshot().players[0]?.avatar?.hat).toBe('bandana')
  })

  it('reconectar com o mesmo token devolve o mesmo jogador e a cadeira', () => {
    const id = join('Riul', CREATOR)
    room.disconnect(id)
    expect(join('Riul', CREATOR)).toBe(id)
    expect(room.snapshot().players).toHaveLength(1)
  })

  it('quem chega com a partida rolando entra assistindo', () => {
    join('Riul', CREATOR)
    room.handle(room.snapshot().ownerId!, { t: 'start' })
    const late = join('Atrasado', token(9))
    expect(room.snapshot().players.find((p) => p.id === late)?.seat).toBeNull()
  })
})

describe('poderes do dono', () => {
  it('quem não é dono não mexe na sala', () => {
    join('Riul', CREATOR)
    const guest = join('Ana', token(1))
    room.handle(guest, { t: 'start' })
    expect(inbox(room.drain(), guest)).toContainEqual({ t: 'error', code: 'not_owner' })
  })

  it('expulsar fecha a conexão e impede a volta', () => {
    const owner = join('Riul', CREATOR)
    const guest = join('Ana', token(1))
    room.handle(owner, { t: 'kick', playerId: guest })
    expect(room.drain()).toContainEqual({ close: guest, msg: { t: 'kicked' } })
    expect(room.join({ t: 'hello', nick: 'Ana', token: token(1) })).toEqual({
      ok: false,
      error: 'banned',
    })
  })

  it('passa a posse; e se o dono sai, o mais antigo conectado assume', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    const bia = join('Bia', token(2))
    room.handle(owner, { t: 'owner', playerId: bia })
    expect(room.snapshot().ownerId).toBe(bia)
    room.handle(bia, { t: 'leave' })
    expect(room.snapshot().ownerId).toBe(owner)
    room.handle(owner, { t: 'leave' })
    expect(room.snapshot().ownerId).toBe(ana)
  })

  it('troca jogadores de cadeira, põe e tira bot', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'move', playerId: ana, seat: 2 })
    expect(room.snapshot().seats[2]).toEqual({ kind: 'humano', playerId: ana })
    expect(room.snapshot().seats[1]).toEqual({ kind: 'vazia' })
    room.handle(owner, { t: 'bot', seat: 1, add: true })
    expect(room.snapshot().seats[1]?.kind).toBe('bot')
    room.handle(owner, { t: 'bot', seat: 1, add: false })
    expect(room.snapshot().seats[1]).toEqual({ kind: 'vazia' })
  })

  it('muda nome e visibilidade', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, {
      t: 'settings',
      settings: { name: 'Boteco', visibility: 'privada' },
    })
    expect(room.snapshot()).toMatchObject({ name: 'Boteco', visibility: 'privada' })
  })

  it('fechar a sala desconecta todo mundo', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'close' })
    const out = room.drain()
    expect(out).toContainEqual({ close: ana, msg: { t: 'closed' } })
    expect(room.data.closed).toBe(true)
  })
})

describe('partida', () => {
  function startWithOneHuman() {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'start' })
    return owner
  }

  it('começar completa as cadeiras com bots e manda a visão de cada um', () => {
    const owner = startWithOneHuman()
    const out = room.drain()
    expect(room.snapshot().seats.filter((s) => s.kind === 'bot')).toHaveLength(3)
    const game = inbox(out, owner).find((m) => m.t === 'game')
    expect(game).toMatchObject({ t: 'game', view: { seat: 0 } })
  })

  it('bots jogam sozinhos e o humano tem 20 s na vez dele', () => {
    startWithOneHuman()
    room.drain()
    advance(10_000)
    const game = room.data.game!
    expect(seatsToAct(game)).toContain(0)
    expect(room.data.timer?.kind).toBe('timeout')
    expect(room.data.timer!.at - clock).toBeLessThanOrEqual(TURN_MS + 1_300)
  })

  it('tempo esgotado: o bot joga pelo humano', () => {
    const owner = startWithOneHuman()
    advance(10_000)
    room.drain()
    advance(TURN_MS + 1_400)
    const events = inbox(room.drain(), owner).flatMap((m) => (m.t === 'game' ? m.events : []))
    expect(events.some((e) => 'seat' in e && e.seat === 0)).toBe(true)
  })

  it('alarme que dispara um pouco antes da hora ainda faz o bot jogar', () => {
    startWithOneHuman()
    room.drain()
    // Avança até ser a vez de um bot e dispara o alarme 30 ms antes do horário marcado.
    for (let i = 0; i < 20 && room.data.timer?.kind !== 'act'; i++) advance(TURN_MS + 2_000)
    const timer = room.data.timer!
    expect(timer.kind).toBe('act')
    const before = room.data.game
    clock = timer.at - 30
    room.alarm()
    expect(room.data.game).not.toBe(before)
  })

  it('jogador desconectado na vez dele: o bot assume na hora', () => {
    const owner = startWithOneHuman()
    advance(10_000)
    room.disconnect(owner)
    expect(room.data.timer?.kind).toBe('act')
    expect(room.data.timer!.at - clock).toBeLessThan(1_000)
  })

  it('ação de quem não está sentado é recusada', () => {
    startWithOneHuman()
    const watcher = join('Curioso', token(5))
    room.handle(watcher, { t: 'game', action: { type: 'truco' } })
    expect(inbox(room.drain(), watcher)).toContainEqual({ t: 'error', code: 'not_seated' })
  })

  it('jogada fora da vez volta com o erro do engine', () => {
    const owner = startWithOneHuman()
    advance(10_000)
    room.drain()
    // Força a vez de outra cadeira para testar a recusa.
    room.data.game!.hand.turn = 1
    room.handle(owner, { t: 'game', action: { type: 'play', index: 0 } })
    expect(inbox(room.drain(), owner)).toContainEqual({ t: 'error', code: 'not_your_turn' })
  })

  it('truco contra a dupla de um humano: o bot parceiro também responde', () => {
    const owner = startWithOneHuman()
    const game = room.data.game!
    // Monta um truco pedido pelo time 1 contra a dupla do humano (cadeiras 0 e 2).
    game.hand.onzePending = null
    game.hand.truco = { team: 1, caller: 1, stake: 3, runVotes: [] }
    room.handle(owner, { t: 'game', action: { type: 'run' } })
    // O humano quis correr; quem decide agora é o bot da cadeira 2, sem esperar 20 s.
    expect(room.data.game!.hand.truco?.runVotes).toEqual([0])
    expect(room.data.timer?.kind).toBe('act')
    advance(2_000)
    const after = room.data.game!
    const ranOrAccepted = after.phase !== 'playing' || after.hand.truco === null
    const raised = after.hand.truco?.team === 0
    expect(ranOrAccepted || raised).toBe(true)
    expect(owner).toBeTruthy()
  })

  it('quem sai no meio da partida vira bot', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'start' })
    room.handle(ana, { t: 'leave' })
    expect(room.snapshot().seats[1]).toEqual({ kind: 'bot', name: 'Ana (bot)' })
  })

  it('uma partida inteira só com bots termina', () => {
    startWithOneHuman()
    room.disconnect(room.snapshot().ownerId!)
    join('Riul', CREATOR)
    room.handle(room.snapshot().ownerId!, { t: 'leave' })
    advance(60 * 60_000)
    expect(room.data.game?.phase === 'gameOver' || room.data.closed).toBe(true)
  })
})

describe('provocações e limpeza', () => {
  it('limita uma provocação a cada 3 s', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'taunt', id: 'medinho' })
    room.handle(owner, { t: 'taunt', id: 'fogo' })
    const msgs = inbox(room.drain(), owner)
    expect(msgs).toContainEqual({ t: 'taunt', seat: 0, nick: 'Riul', id: 'medinho' })
    expect(msgs).toContainEqual({ t: 'error', code: 'rate_limited' })
    clock += 3_000
    room.handle(owner, { t: 'taunt', id: 'fogo' })
    expect(inbox(room.drain(), owner)).toContainEqual({
      t: 'taunt',
      seat: 0,
      nick: 'Riul',
      id: 'fogo',
    })
  })

  it('bots provocam durante a partida, com o nome e a cadeira deles', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'start' })
    room.drain()
    const taunts: ServerMessage[] = []
    for (let i = 0; i < 120 && room.data.game?.phase !== 'gameOver'; i++) {
      advance(TURN_MS + 2_000)
      taunts.push(...inbox(room.drain(), owner).filter((m) => m.t === 'taunt'))
    }
    expect(taunts.length).toBeGreaterThan(0)
    for (const taunt of taunts) {
      expect(taunt).toMatchObject({ t: 'taunt', seat: expect.any(Number) })
      if (taunt.t === 'taunt' && taunt.seat !== 0) {
        expect(room.snapshot().seats[taunt.seat!]).toMatchObject({ kind: 'bot', name: taunt.nick })
      }
    }
  })

  it('jukebox: qualquer um escolhe, todos recebem; o fim da faixa só avança uma vez', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(ana, { t: 'jukebox', trackId: 'evidencias' })
    const out = room.drain()
    const rooms = [owner, ana].map((id) => inbox(out, id).find((m) => m.t === 'room'))
    for (const msg of rooms) {
      expect(msg).toMatchObject({ room: { jukebox: { trackId: 'evidencias', startedAt: clock } } })
    }
    clock += 200_000
    room.handle(owner, { t: 'jukebox', trackId: 'pense-em-mim', after: 'evidencias' })
    room.handle(ana, { t: 'jukebox', trackId: 'pense-em-mim', after: 'evidencias' })
    room.handle(ana, { t: 'jukebox', trackId: 'fio-de-cabelo', after: 'evidencias' })
    expect(room.snapshot().jukebox).toEqual({ trackId: 'pense-em-mim', startedAt: clock })
  })

  it('jukebox limita trocas manuais a uma a cada 3 s', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'jukebox', trackId: 'evidencias' })
    room.handle(owner, { t: 'jukebox', trackId: 'pao-de-mel' })
    expect(inbox(room.drain(), owner)).toContainEqual({ t: 'error', code: 'rate_limited' })
    expect(room.snapshot().jukebox.trackId).toBe('evidencias')
  })

  it('sala vazia fecha sozinha depois de 5 minutos', () => {
    const owner = join('Riul', CREATOR)
    room.disconnect(owner)
    advance(EMPTY_CLOSE_MS - 1)
    expect(room.data.closed).toBe(false)
    advance(1)
    expect(room.data.closed).toBe(true)
  })
})
