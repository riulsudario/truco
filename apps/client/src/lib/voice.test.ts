import { describe, expect, it, vi } from 'vitest'
import { pick } from './voice'

vi.mock('./sound.svelte', () => ({ sound: { playVoice: () => {} } }))
vi.mock('./voice-manifest.json', () => ({
  default: {
    version: 1,
    lines: [
      {
        id: 'six_001',
        event: 'six',
        text: 'SEIS, LADRÃO!',
        takes: {
          jessica: [
            { variant: 1, file: 'jessica/six/seis_ladrao_01' },
            { variant: 3, file: 'jessica/six/seis_ladrao_03' },
          ],
        },
      },
      { id: 'six_002', event: 'six', text: 'SEEEEEIS, SEU CORNO!', takes: {} },
    ],
  },
}))

describe('recorded lines', () => {
  it('the same seed gives the same line and take in any browser', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(pick('six', seed, 'jessica')).toEqual(pick('six', seed, 'jessica'))
    }
  })

  it('uses only lines the voice has recorded and varies the take', () => {
    const files = new Set<string>()
    for (let seed = 0; seed < 50; seed++) {
      const line = pick('six', seed, 'jessica')
      expect(line.text).toBe('SEIS, LADRÃO!')
      expect(line.voice).toBe('jessica')
      files.add(line.file)
    }
    expect(files).toEqual(
      new Set(['voices/jessica/six/seis_ladrao_01', 'voices/jessica/six/seis_ladrao_03']),
    )
  })

  it('a voice without recordings falls back to the team pack', () => {
    const line = pick('six', 7, 'tonhao')
    expect(line.voice).toBeUndefined()
    expect(line.file).toMatch(/^lines\/six\//)
  })
})
