import type { Lobby } from './lobby'
import type { Room } from './room'

export interface Env {
  ROOMS: DurableObjectNamespace<Room>
  LOBBY: DurableObjectNamespace<Lobby>
  /** Fixed seed for end-to-end tests; empty in production. */
  TRUCO_SEED?: string
}
