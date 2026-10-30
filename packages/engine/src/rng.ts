/**
 * mulberry32 sem estado escondido: recebe a semente atual e devolve o número sorteado
 * junto com a próxima semente, para o estado do jogo continuar puro e serializável.
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

/** Gerador com estado para quem não precisa serializar (bots, testes). */
export function createRandom(seed: number): () => number {
  let current = seed
  return () => {
    const [value, next] = nextRandom(current)
    current = next
    return value
  }
}
