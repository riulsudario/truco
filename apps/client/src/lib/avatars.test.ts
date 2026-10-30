import { AvatarSchema, BOT_AVATARS, DEFAULT_AVATAR, VOICES } from '@truco/protocol'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import sheets from './avatar-sheets.json'
import { avatarFor, fromName, voiceFor } from './avatars'

describe('visual dos jogadores', () => {
  it('bots da casa têm visual fixo, inclusive quando viram bot no lugar de alguém', () => {
    expect(avatarFor('Tonhão', null)).toEqual(BOT_AVATARS['Tonhão'])
    expect(avatarFor('Tonhão (bot)', null)).toEqual(BOT_AVATARS['Tonhão'])
  })

  it('quem escolheu no editor usa o escolhido; quem vira bot mantém o seu', () => {
    const chosen = { ...DEFAULT_AVATAR, hair: 'blackpower' as const }
    expect(avatarFor('Riul', chosen)).toEqual(chosen)
    expect(avatarFor('Riul (bot)', chosen)).toEqual(chosen)
  })

  it('o sorteio pelo apelido é estável e sempre dá um visual válido', () => {
    expect(fromName('Riul')).toEqual(fromName('Riul'))
    for (let i = 0; i < 300; i++) expect(v.is(AvatarSchema, fromName(`jogador ${i}`))).toBe(true)
  })

  it('bot da casa fala com a própria voz; quem não escolheu ganha uma do gênero do corpo', () => {
    expect(voiceFor('Dona Cida', null)).toBe('dona_cida')
    expect(voiceFor('Tonhão (bot)', null)).toBe('tonhao')
    expect(voiceFor('Riul', { ...DEFAULT_AVATAR, voice: 'jessica' })).toBe('jessica')
    for (let i = 0; i < 100; i++) {
      const name = `jogador ${i}`
      expect(VOICES[voiceFor(name, null)].gender).toBe(fromName(name).body)
      expect(voiceFor(name, null)).toBe(voiceFor(name, null))
    }
  })

  it('toda peça do catálogo tem as tiras de imagem geradas', () => {
    const parts = sheets.parts as Record<string, { file: string }[]>
    for (const layers of Object.values(parts)) {
      for (const layer of layers) {
        expect(existsSync(join(__dirname, '../../public/avatar', layer.file))).toBe(true)
      }
    }
  })
})
