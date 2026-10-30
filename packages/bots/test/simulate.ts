import {
  createRandom,
  legalActions,
  newGame,
  reduce,
  seatsToAct,
  teamOf,
  toPlayerView,
  type Action,
  type GameState,
  type Seat,
  type Team,
} from '@truco/engine'
import { decide, type Difficulty } from '../src'

export type Player = Difficulty | 'random'

/** Plays a full game. players[i] controls seat i. Returns the winning team. */
export function simulate(players: [Player, Player, Player, Player], seed: number): Team {
  const random = createRandom(seed * 31 + 7)
  let state: GameState = newGame({ seed, dealer: (seed % 4) as Seat })
  for (let step = 0; step < 5000; step++) {
    if (state.phase === 'gameOver') return state.winner!
    let action: Action
    if (state.phase === 'handOver') {
      action = { type: 'nextHand' }
    } else {
      const seat = seatsToAct(state)[0]!
      const player = players[seat]
      if (player === 'random') {
        const options = legalActions(state, seat)
        action = options[Math.floor(random() * options.length)]!
      } else {
        action = decide({ view: toPlayerView(state, seat), random, difficulty: player })
      }
    }
    const result = reduce(state, action)
    if (!result.ok) {
      throw new Error(`illegal move ${JSON.stringify(action)}: ${result.error}`)
    }
    state = result.state
  }
  throw new Error('game did not finish')
}

export function winRate(
  players: [Player, Player, Player, Player],
  games: number,
  team: Team = 0,
): number {
  let wins = 0
  for (let seed = 1; seed <= games; seed++) {
    if (simulate(players, seed) === team) wins++
  }
  return wins / games
}

export { teamOf }
