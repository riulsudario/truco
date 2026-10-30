import type { Lobby } from './lobby'
import type { Room } from './room'

export interface Env {
  ROOMS: DurableObjectNamespace<Room>
  LOBBY: DurableObjectNamespace<Lobby>
  /** Semente fixa para testes ponta a ponta; em produção fica vazia. */
  TRUCO_SEED?: string
}
