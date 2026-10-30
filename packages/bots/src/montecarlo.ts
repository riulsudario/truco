import {
  cardId,
  cardPower,
  cleanDeck,
  handWinner,
  HIDDEN_POWER,
  nextSeat,
  partnerOf,
  SEATS,
  teamOf,
  type Card,
  type PlayerView,
  type RoundResult,
  type Seat,
} from '@truco/engine'
import { greedyPick, trickOf } from './policy'

/**
 * Chance do time da cadeira levar a mão, simulando o resto dela várias vezes. As cartas
 * que o bot não vê são sorteadas entre as que sobram no baralho, então ele não trapaceia.
 * Com firstIndex, a primeira jogada simulada é a carta escolhida (precisa ser a vez dele).
 * Empate em todas as vazas conta meio ponto.
 */
export function winProbability(
  view: PlayerView,
  random: () => number,
  samples: number,
  firstIndex?: number,
): number {
  const seat = view.seat!
  const { hand } = view
  const power = (card: Card) => cardPower(card, hand.manilha)

  const myCards = hand.myCards.filter((card): card is Card => card !== null)
  const partnerCards = hand.partnerCards
  const known = new Set(
    [
      hand.vira,
      ...myCards,
      ...(partnerCards ?? []),
      ...hand.rounds.flatMap((round) =>
        round.plays.flatMap((play) => (play.card ? [play.card] : [])),
      ),
    ].map(cardId),
  )
  const pool = cleanDeck().filter((card) => !known.has(cardId(card)))
  const unknownSeats = SEATS.filter((s) => s !== seat && !(partnerCards && s === partnerOf(seat)))
  if (myCards.length !== hand.myCards.length) unknownSeats.push(seat)

  const results = hand.rounds.flatMap((round) => (round.result === null ? [] : [round.result]))
  const current = hand.rounds[hand.rounds.length - 1]!
  const currentPlays = current.plays.map((play) => ({
    seat: play.seat,
    power: play.card && !play.hidden ? power(play.card) : HIDDEN_POWER,
  }))

  let total = 0
  for (let i = 0; i < samples; i++) {
    const powers: number[][] = [[], [], [], []]
    powers[seat] = myCards.map(power)
    if (partnerCards) powers[partnerOf(seat)] = partnerCards.map(power)

    const deck = [...pool]
    let next = 0
    for (let j = deck.length - 1; j > 0; j--) {
      const k = Math.floor(random() * (j + 1))
      ;[deck[j], deck[k]] = [deck[k]!, deck[j]!]
    }
    for (const s of unknownSeats) {
      powers[s] = deck.slice(next, next + hand.cardCounts[s]!).map(power)
      next += hand.cardCounts[s]!
    }

    const winner = rollout(powers, [...results], [...currentPlays], hand.turn, seat, firstIndex)
    total += winner === teamOf(seat) ? 1 : winner === null ? 0.5 : 0
  }
  return total / samples
}

function rollout(
  powers: number[][],
  results: RoundResult[],
  plays: { seat: Seat; power: number }[],
  turn: Seat,
  forcedSeat: Seat,
  forcedIndex: number | undefined,
): RoundResult | null {
  let seat = turn
  let forced = forcedIndex
  for (;;) {
    const decided = handWinner(results)
    if (decided !== undefined) return decided

    const hand = powers[seat]!
    let index: number
    if (forced !== undefined && seat === forcedSeat) {
      index = forced
      forced = undefined
    } else {
      const trick = trickOf(
        plays.map((p) => ({ team: teamOf(p.seat), power: p.power })),
        results.length,
        results[0] ?? null,
      )
      index = greedyPick(hand, trick, teamOf(seat)).index
    }
    plays.push({ seat, power: hand.splice(index, 1)[0]! })

    if (plays.length < 4) {
      seat = nextSeat(seat)
      continue
    }
    const best = Math.max(...plays.map((p) => p.power))
    const top = plays.filter((p) => p.power === best)
    const teams = new Set(top.map((p) => teamOf(p.seat)))
    results.push(teams.size === 1 ? teamOf(top[0]!.seat) : 'tie')
    seat = top[0]!.seat
    plays.length = 0
  }
}
