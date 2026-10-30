import { describe, expect, it } from 'vitest'
import { PLAYED } from './scene'

describe('cartas jogadas no feltro', () => {
  it('nenhuma carta fica esticada: a largura na tela é parecida com a altura', () => {
    for (const quad of Object.values(PLAYED)) {
      const [a, b, , d] = quad
      const side = (p: readonly number[], q: readonly number[]) =>
        Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!)
      const ratio = side(a, b) / side(a, d)
      expect(ratio).toBeGreaterThan(0.2)
      expect(ratio).toBeLessThan(3.5)
    }
  })
})
