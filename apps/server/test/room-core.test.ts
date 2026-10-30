import { seatsToAct } from '@truco/engine'
import { DEFAULT_AVATAR, type RoomSettings, type ServerMessage } from '@truco/protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import { createRoomData, EMPTY_CLOSE_MS, RoomCore, TURN_MS, type Outgoing } from '../src/room-core'

const SETTINGS: RoomSettings = {
  name: "Riul's table",
  visibility: 'public',
  password: null,
  difficulty: 'normal',
  spectators: true,
}
const CREATOR = 'token-of-the-creator-123'
const token = (n: number) => `token-player-${n}-xxxxxx`

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

/** Messages sent to a player since the last drain. */
function inbox(out: Outgoing[], playerId: string): ServerMessage[] {
  return out.flatMap((o) =>
    'to' in o ? (o.to === playerId ? [o.msg] : []) : o.close === playerId ? [o.msg] : [],
  )
}

/** Advances the clock and fires the due alarms, as the Durable Object would. */
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

describe('joining the room', () => {
  it('the creator becomes owner and sits in the first seat; the next one sits in the following', () => {
    const owner = join('Riul', CREATOR)
    const guest = join('Ana', token(1))
    const snap = room.snapshot()
    expect(snap.ownerId).toBe(owner)
    expect(snap.seats[0]).toEqual({ kind: 'human', playerId: owner })
    expect(snap.seats[1]).toEqual({ kind: 'human', playerId: guest })
  })

  it('the public state never carries a token or password', () => {
    setup({ password: 'secret' })
    join('Riul', CREATOR)
    const json = JSON.stringify(room.snapshot())
    expect(json).not.toContain(CREATOR)
    expect(json).not.toContain('secret')
    expect(room.snapshot().hasPassword).toBe(true)
  })

  it('a wrong password does not get in; the creator and the right password do', () => {
    setup({ password: 'secret' })
    expect(room.join({ t: 'hello', nick: 'X', token: token(1), password: 'guess' })).toEqual({
      ok: false,
      error: 'bad_password',
    })
    expect(() => join('Riul', CREATOR)).not.toThrow()
    expect(() => join('Ana', token(2), 'secret')).not.toThrow()
  })

  it('stores the avatar look and sends it to the room; reconnecting can change the look', () => {
    const avatar = { ...DEFAULT_AVATAR, hair: 'afro' as const }
    const id = room.join({ t: 'hello', nick: 'Riul', token: CREATOR, avatar })
    expect(room.snapshot().players[0]?.avatar).toEqual(avatar)
    room.disconnect(id.ok ? id.playerId : '')
    room.join({ t: 'hello', nick: 'Riul', token: CREATOR, avatar: { ...avatar, hat: 'bandana' } })
    expect(room.snapshot().players[0]?.avatar?.hat).toBe('bandana')
  })

  it('reconnecting with the same token returns the same player and seat', () => {
    const id = join('Riul', CREATOR)
    room.disconnect(id)
    expect(join('Riul', CREATOR)).toBe(id)
    expect(room.snapshot().players).toHaveLength(1)
  })

  it('whoever arrives mid-game joins as a spectator', () => {
    join('Riul', CREATOR)
    room.handle(room.snapshot().ownerId!, { t: 'start' })
    const late = join('Latecomer', token(9))
    expect(room.snapshot().players.find((p) => p.id === late)?.seat).toBeNull()
  })

  it('without spectators, only those who get a seat come in, and nobody stands up to watch', () => {
    setup({ spectators: false })
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    expect(room.snapshot().spectators).toBe(false)
    room.handle(ana, { t: 'stand' })
    expect(inbox(room.drain(), ana)).toEqual([{ t: 'error', code: 'no_spectators' }])
    room.handle(owner, { t: 'move', playerId: ana, seat: null })
    expect(inbox(room.drain(), owner)).toEqual([{ t: 'error', code: 'no_spectators' }])

    join('Bia', token(2))
    join('Caio', token(3))
    expect(room.join({ t: 'hello', nick: 'Dani', token: token(4) })).toEqual({
      ok: false,
      error: 'no_spectators',
    })
    // A player of the room coming back still gets in, even mid-game.
    room.handle(owner, { t: 'start' })
    room.disconnect(ana)
    expect(join('Ana', token(1))).toBe(ana)
    expect(room.summary().spectators).toBe(false)
  })

  it('rooms stored before the option existed allow spectators', () => {
    const { spectators: _, ...old } = SETTINGS
    room = new RoomCore(
      createRoomData('ABCD', old as RoomSettings, CREATOR, 42, clock),
      () => clock,
    )
    join('Riul', CREATOR)
    room.handle(room.snapshot().ownerId!, { t: 'start' })
    expect(() => join('Latecomer', token(9))).not.toThrow()
    expect(room.snapshot().spectators).toBe(true)
  })
})

describe('owner powers', () => {
  it('non-owners cannot change the room', () => {
    join('Riul', CREATOR)
    const guest = join('Ana', token(1))
    room.handle(guest, { t: 'start' })
    expect(inbox(room.drain(), guest)).toContainEqual({ t: 'error', code: 'not_owner' })
  })

  it('kicking closes the connection and prevents coming back', () => {
    const owner = join('Riul', CREATOR)
    const guest = join('Ana', token(1))
    room.handle(owner, { t: 'kick', playerId: guest })
    expect(room.drain()).toContainEqual({ close: guest, msg: { t: 'kicked' } })
    expect(room.join({ t: 'hello', nick: 'Ana', token: token(1) })).toEqual({
      ok: false,
      error: 'banned',
    })
  })

  it('transfers ownership; if the owner leaves, the oldest connected player takes over', () => {
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

  it('moves players between seats, adds and removes bots', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'move', playerId: ana, seat: 2 })
    expect(room.snapshot().seats[2]).toEqual({ kind: 'human', playerId: ana })
    expect(room.snapshot().seats[1]).toEqual({ kind: 'empty' })
    room.handle(owner, { t: 'bot', seat: 1, add: true })
    expect(room.snapshot().seats[1]?.kind).toBe('bot')
    room.handle(owner, { t: 'bot', seat: 1, add: false })
    expect(room.snapshot().seats[1]).toEqual({ kind: 'empty' })
  })

  it('changes name, visibility and spectators', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, {
      t: 'settings',
      settings: { name: 'Boteco', visibility: 'private' },
    })
    expect(room.snapshot()).toMatchObject({ name: 'Boteco', visibility: 'private' })
    room.handle(owner, { t: 'settings', settings: { spectators: false } })
    expect(room.snapshot()).toMatchObject({ name: 'Boteco', spectators: false })
  })

  it('closing the room disconnects everyone', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'close' })
    const out = room.drain()
    expect(out).toContainEqual({ close: ana, msg: { t: 'closed' } })
    expect(room.data.closed).toBe(true)
  })
})

describe('game', () => {
  function startWithOneHuman() {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'start' })
    return owner
  }

  it('starting fills the seats with bots and sends each player their view', () => {
    const owner = startWithOneHuman()
    const out = room.drain()
    expect(room.snapshot().seats.filter((s) => s.kind === 'bot')).toHaveLength(3)
    const game = inbox(out, owner).find((m) => m.t === 'game')
    expect(game).toMatchObject({ t: 'game', view: { seat: 0 } })
  })

  it('bots play on their own and the human gets 20 s on their turn', () => {
    startWithOneHuman()
    room.drain()
    advance(10_000)
    const game = room.data.game!
    expect(seatsToAct(game)).toContain(0)
    expect(room.data.timer?.kind).toBe('timeout')
    expect(room.data.timer!.at - clock).toBeLessThanOrEqual(TURN_MS + 1_300)
  })

  it('on timeout the bot plays for the human', () => {
    const owner = startWithOneHuman()
    advance(10_000)
    room.drain()
    advance(TURN_MS + 1_400)
    const events = inbox(room.drain(), owner).flatMap((m) => (m.t === 'game' ? m.events : []))
    expect(events.some((e) => 'seat' in e && e.seat === 0)).toBe(true)
  })

  it('an alarm firing slightly early still makes the bot play', () => {
    startWithOneHuman()
    room.drain()
    // Advances until it is a bot's turn and fires the alarm 30 ms before the scheduled time.
    for (let i = 0; i < 20 && room.data.timer?.kind !== 'act'; i++) advance(TURN_MS + 2_000)
    const timer = room.data.timer!
    expect(timer.kind).toBe('act')
    const before = room.data.game
    clock = timer.at - 30
    room.alarm()
    expect(room.data.game).not.toBe(before)
  })

  it('a player disconnected on their turn: the bot takes over right away', () => {
    const owner = startWithOneHuman()
    advance(10_000)
    room.disconnect(owner)
    expect(room.data.timer?.kind).toBe('act')
    expect(room.data.timer!.at - clock).toBeLessThan(1_000)
  })

  it('actions from someone not seated are rejected', () => {
    startWithOneHuman()
    const watcher = join('Onlooker', token(5))
    room.handle(watcher, { t: 'game', action: { type: 'truco' } })
    expect(inbox(room.drain(), watcher)).toContainEqual({ t: 'error', code: 'not_seated' })
  })

  it('playing out of turn returns the engine error', () => {
    const owner = startWithOneHuman()
    advance(10_000)
    room.drain()
    // Forces another seat's turn to test the rejection.
    room.data.game!.hand.turn = 1
    room.handle(owner, { t: 'game', action: { type: 'play', index: 0 } })
    expect(inbox(room.drain(), owner)).toContainEqual({ t: 'error', code: 'not_your_turn' })
  })

  it("truco against a human's team: the bot partner answers too", () => {
    const owner = startWithOneHuman()
    const game = room.data.game!
    // Sets up a truco called by team 1 against the human's team (seats 0 and 2).
    game.hand.elevenPending = null
    game.hand.truco = { team: 1, caller: 1, stake: 3, runVotes: [] }
    room.handle(owner, { t: 'game', action: { type: 'run' } })
    // The human wanted to run; now the bot in seat 2 decides, without waiting 20 s.
    expect(room.data.game!.hand.truco?.runVotes).toEqual([0])
    expect(room.data.timer?.kind).toBe('act')
    advance(2_000)
    const after = room.data.game!
    const ranOrAccepted = after.phase !== 'playing' || after.hand.truco === null
    const raised = after.hand.truco?.team === 0
    expect(ranOrAccepted || raised).toBe(true)
    expect(owner).toBeTruthy()
  })

  it('whoever leaves mid-game becomes a bot', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'start' })
    room.handle(ana, { t: 'leave' })
    expect(room.snapshot().seats[1]).toEqual({ kind: 'bot', name: 'Ana (bot)' })
  })

  it('a full bots-only game finishes', () => {
    startWithOneHuman()
    room.disconnect(room.snapshot().ownerId!)
    join('Riul', CREATOR)
    room.handle(room.snapshot().ownerId!, { t: 'leave' })
    advance(60 * 60_000)
    expect(room.data.game?.phase === 'gameOver' || room.data.closed).toBe(true)
  })
})

describe('taunts and cleanup', () => {
  it('limits taunts to one every 3 s', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'taunt', id: 'scared' })
    room.handle(owner, { t: 'taunt', id: 'fire' })
    const msgs = inbox(room.drain(), owner)
    expect(msgs).toContainEqual({ t: 'taunt', seat: 0, nick: 'Riul', id: 'scared' })
    expect(msgs).toContainEqual({ t: 'error', code: 'rate_limited' })
    clock += 3_000
    room.handle(owner, { t: 'taunt', id: 'fire' })
    expect(inbox(room.drain(), owner)).toContainEqual({
      t: 'taunt',
      seat: 0,
      nick: 'Riul',
      id: 'fire',
    })
  })

  it('bots taunt during the game, with their name and seat', () => {
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

  it('jukebox: anyone picks, everyone receives; the end of a track only advances once', () => {
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

  it('jukebox limits manual changes to one every 3 s', () => {
    const owner = join('Riul', CREATOR)
    room.handle(owner, { t: 'jukebox', trackId: 'evidencias' })
    room.handle(owner, { t: 'jukebox', trackId: 'pao-de-mel' })
    expect(inbox(room.drain(), owner)).toContainEqual({ t: 'error', code: 'rate_limited' })
    expect(room.snapshot().jukebox.trackId).toBe('evidencias')
  })

  it('the room closes as soon as the last person leaves', () => {
    const owner = join('Riul', CREATOR)
    const ana = join('Ana', token(1))
    room.handle(owner, { t: 'leave' })
    expect(room.data.closed).toBe(false)
    room.handle(ana, { t: 'leave' })
    expect(room.data.closed).toBe(true)
    expect(room.summary().humans).toBe(0)
  })

  it('a room whose people all dropped closes after a short wait', () => {
    const owner = join('Riul', CREATOR)
    room.disconnect(owner)
    advance(EMPTY_CLOSE_MS - 1)
    expect(room.data.closed).toBe(false)
    advance(1)
    expect(room.data.closed).toBe(true)
  })
})
