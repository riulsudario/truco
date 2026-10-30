import type { GameEvent } from '@truco/engine'
import { describe, expect, it } from 'vitest'
import { tauntReaction } from '../src'

const always = () => 0
const never = () => 0.999

describe('provocações dos bots', () => {
  it('quem pede truco não provoca (já grita a fala); o parceiro dele põe pilha', () => {
    const events: GameEvent[] = [{ type: 'trucoCalled', seat: 1, stake: 3 }]
    expect(tauntReaction(events, 1, always)).toBeNull()
    expect(tauntReaction(events, 3, always)).toBe('truco-ladrao')
    expect(tauntReaction(events, 3, never)).toBeNull()
  })

  it('tira sarro quando o adversário corre, mas não quando o próprio time corre', () => {
    const events: GameEvent[] = [{ type: 'ran', seat: 0 }]
    expect(tauntReaction(events, 1, always)).toBe('medinho')
    expect(tauntReaction(events, 2, always)).toBeNull()
  })

  it('reage ao fim do jogo conforme o resultado', () => {
    const events: GameEvent[] = [{ type: 'gameEnded', winner: 1 }]
    expect(tauntReaction(events, 3, always)).toBe('palmas')
    expect(tauntReaction(events, 0, always)).toBe('fui-roubado')
  })

  it('o evento mais recente do lote tem prioridade', () => {
    const events: GameEvent[] = [
      { type: 'roundEnded', result: 'tie' },
      { type: 'gameEnded', winner: 0 },
    ]
    expect(tauntReaction(events, 0, always)).toBe('palmas')
  })
})
