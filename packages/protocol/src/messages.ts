import type { GameError, GameEvent, PlayerView, Seat } from '@truco/engine'
import * as v from 'valibot'
import { AVATAR_OPTIONS, type Avatar } from './avatar'
import { TRACK_IDS, type JukeboxState } from './jukebox'
import { TAUNT_IDS, type TauntId } from './taunts'

export const DIFFICULTIES = ['easy', 'normal'] as const

export type Difficulty = (typeof DIFFICULTIES)[number]
export type Visibility = 'public' | 'private'

const seat = v.picklist([0, 1, 2, 3])
const playerId = v.pipe(v.string(), v.maxLength(32))
const nick = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(16))
const choice = <T extends Record<string, unknown>>(options: T) =>
  v.picklist(Object.keys(options) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]])

export const AvatarSchema = v.object({
  body: choice(AVATAR_OPTIONS.body),
  skin: choice(AVATAR_OPTIONS.skin),
  hair: choice(AVATAR_OPTIONS.hair),
  hairColor: choice(AVATAR_OPTIONS.hairColor),
  shirt: choice(AVATAR_OPTIONS.shirt),
  shirtColor: choice(AVATAR_OPTIONS.shirtColor),
  pants: choice(AVATAR_OPTIONS.pants),
  pantsColor: choice(AVATAR_OPTIONS.pantsColor),
  facialHair: choice(AVATAR_OPTIONS.facialHair),
  glasses: choice(AVATAR_OPTIONS.glasses),
  hat: choice(AVATAR_OPTIONS.hat),
  hatColor: choice(AVATAR_OPTIONS.hatColor),
  voice: v.optional(choice(AVATAR_OPTIONS.voice)),
}) satisfies v.GenericSchema<unknown, Avatar>

const roomName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(32))
const password = v.pipe(v.string(), v.maxLength(32))
/** Secret browser token; identifies the player for reconnecting. */
const token = v.pipe(v.string(), v.minLength(16), v.maxLength(64))

export const RoomSettingsSchema = v.object({
  name: roomName,
  visibility: v.picklist(['public', 'private']),
  password: v.nullable(password),
  difficulty: v.picklist(DIFFICULTIES),
  /** Whether people can watch without a seat. Rooms created before the option allow it. */
  spectators: v.optional(v.boolean(), true),
})
export type RoomSettings = v.InferOutput<typeof RoomSettingsSchema>

export const CreateRoomSchema = v.object({ settings: RoomSettingsSchema, token })

const GameActionSchema = v.variant('type', [
  v.object({
    type: v.literal('play'),
    index: v.pipe(v.number(), v.integer()),
    hidden: v.optional(v.boolean()),
  }),
  v.object({ type: v.literal('truco') }),
  v.object({ type: v.literal('accept') }),
  v.object({ type: v.literal('run') }),
  v.object({ type: v.literal('eleven'), accept: v.boolean() }),
])
export type GameAction = v.InferOutput<typeof GameActionSchema>

export const ClientMessageSchema = v.variant('t', [
  v.object({
    t: v.literal('hello'),
    nick,
    token,
    password: v.optional(password),
    avatar: v.optional(AvatarSchema),
  }),
  v.object({ t: v.literal('sit'), seat }),
  v.object({ t: v.literal('stand') }),
  v.object({ t: v.literal('ready'), ready: v.boolean() }),
  v.object({ t: v.literal('leave') }),
  v.object({ t: v.literal('settings'), settings: v.partial(RoomSettingsSchema) }),
  v.object({ t: v.literal('move'), playerId, seat: v.nullable(seat) }),
  v.object({ t: v.literal('bot'), seat, add: v.boolean() }),
  v.object({ t: v.literal('kick'), playerId }),
  v.object({ t: v.literal('owner'), playerId }),
  v.object({ t: v.literal('start') }),
  v.object({ t: v.literal('stop') }),
  v.object({ t: v.literal('close') }),
  v.object({ t: v.literal('game'), action: GameActionSchema }),
  v.object({ t: v.literal('taunt'), id: v.picklist(TAUNT_IDS) }),
  v.object({ t: v.literal('ping') }),
  /** Picks the track (null stops). With `after`, it only switches if that one is still playing: the "ended, next" case. */
  v.object({
    t: v.literal('jukebox'),
    trackId: v.nullable(v.picklist(TRACK_IDS)),
    after: v.optional(v.picklist(TRACK_IDS)),
  }),
])
export type ClientMessage = v.InferOutput<typeof ClientMessageSchema>

export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  const result = v.safeParse(ClientMessageSchema, data)
  return result.success ? result.output : null
}

export type SeatInfo =
  { kind: 'empty' } | { kind: 'human'; playerId: string } | { kind: 'bot'; name: string }

export interface PlayerInfo {
  id: string
  nick: string
  /** Look picked in the editor; null for whoever joined without one (falls back to a look based on the nickname). */
  avatar: Avatar | null
  seat: Seat | null
  connected: boolean
  ready: boolean
}

export type RoomStatus = 'waiting' | 'playing'

/** Public room state. Never carries a token or password. */
export interface RoomSnapshot {
  code: string
  name: string
  ownerId: string | null
  visibility: Visibility
  hasPassword: boolean
  difficulty: Difficulty
  spectators: boolean
  status: RoomStatus
  seats: SeatInfo[]
  players: PlayerInfo[]
  jukebox: JukeboxState
  /** Server clock when the state was sent, to sync the music. */
  serverTime: number
}

/** Row of the public room list. */
export interface RoomSummary {
  code: string
  name: string
  humans: number
  bots: number
  status: RoomStatus
  hasPassword: boolean
  spectators: boolean
}

export type RoomError =
  | 'invalid_message'
  | 'not_joined'
  | 'not_owner'
  | 'bad_password'
  | 'banned'
  | 'room_not_found'
  | 'room_closed'
  | 'seat_taken'
  | 'game_running'
  | 'no_game'
  | 'not_seated'
  | 'rate_limited'
  | 'player_not_found'
  | 'no_spectators'

export type ErrorCode = RoomError | GameError

export type ServerMessage =
  | { t: 'welcome'; playerId: string; room: RoomSnapshot }
  | { t: 'room'; room: RoomSnapshot }
  | {
      t: 'game'
      view: PlayerView
      events: GameEvent[]
      /** Until when (epoch ms) the seats in `waitingOn` have to act. */
      deadline: number | null
      waitingOn: Seat[]
    }
  | { t: 'gameStopped' }
  /** seat null: whoever taunted is only watching. */
  | { t: 'taunt'; seat: Seat | null; nick: string; id: TauntId }
  | { t: 'error'; code: ErrorCode }
  | { t: 'kicked' }
  | { t: 'closed' }
  | { t: 'pong' }

export type LobbyMessage = { t: 'rooms'; rooms: RoomSummary[] }
