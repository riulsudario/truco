/**
 * mulberry32 without hidden state: takes the current seed and returns the drawn number
 * along with the next seed, so the game state stays pure and serializable.
 */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const nextSeed = (seed + 0x6d2b79f5) | 0
  let t = nextSeed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, nextSeed]
}

export function shuffle<T>(items: readonly T[], seed: number): [T[], number] {
  const result = [...items]
  let current = seed
  for (let i = result.length - 1; i > 0; i--) {
    const [value, next] = nextRandom(current)
    current = next
    const j = Math.floor(value * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return [result, current]
}

/** Stateful generator for callers that don't need to serialize (bots, tests). */
export function createRandom(seed: number): () => number {
  let current = seed
  return () => {
    const [value, next] = nextRandom(current)
    current = next
    return value
  }
}
