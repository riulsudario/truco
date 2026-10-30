import { describe, expect, it, vi } from 'vitest'
import { pick } from './voice'

vi.mock('./sound.svelte', () => ({ sound: { playVoice: () => {} } }))
vi.mock('./voice-manifest.json', () => ({
  default: {
    version: 1,
    lines: [
      {
        id: 'seis_001',
        event: 'seis',
        text: 'SEIS, LADRÃO!',
        takes: {
          jessica: [
            { variant: 1, file: 'jessica/seis/seis_ladrao_01' },
            { variant: 3, file: 'jessica/seis/seis_ladrao_03' },
          ],
        },
      },
      { id: 'seis_002', event: 'seis', text: 'SEEEEEIS, SEU CORNO!', takes: {} },
    ],
  },
}))

describe('falas gravadas', () => {
  it('a mesma semente dá a mesma fala e a mesma tomada em qualquer navegador', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(pick('seis', seed, 'jessica')).toEqual(pick('seis', seed, 'jessica'))
    }
  })

  it('usa só falas que a voz tem gravadas e varia a tomada', () => {
    const files = new Set<string>()
    for (let seed = 0; seed < 50; seed++) {
      const line = pick('seis', seed, 'jessica')
      expect(line.text).toBe('SEIS, LADRÃO!')
      expect(line.voice).toBe('jessica')
      files.add(line.file)
    }
    expect(files).toEqual(
      new Set(['vozes/jessica/seis/seis_ladrao_01', 'vozes/jessica/seis/seis_ladrao_03']),
    )
  })

  it('voz sem gravação cai no pacote do time', () => {
    const line = pick('seis', 7, 'tonhao')
    expect(line.voice).toBeUndefined()
    expect(line.file).toMatch(/^falas\/seis\//)
  })
})
