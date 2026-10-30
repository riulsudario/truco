import { AvatarSchema, BOT_AVATARS, DEFAULT_AVATAR, VOICES } from '@truco/protocol'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import sheets from './avatar-sheets.json'
import { avatarFor, fromName, voiceFor } from './avatars'

describe('player looks', () => {
  it("house bots have a fixed look, even when a bot takes over someone else's seat", () => {
    expect(avatarFor('Tonhão', null)).toEqual(BOT_AVATARS['Tonhão'])
    expect(avatarFor('Tonhão (bot)', null)).toEqual(BOT_AVATARS['Tonhão'])
  })

  it('whoever picked a look in the editor uses it; a bot taking their seat keeps it', () => {
    const chosen = { ...DEFAULT_AVATAR, hair: 'afro' as const }
    expect(avatarFor('Riul', chosen)).toEqual(chosen)
    expect(avatarFor('Riul (bot)', chosen)).toEqual(chosen)
  })

  it('the nickname-based pick is stable and always yields a valid look', () => {
    expect(fromName('Riul')).toEqual(fromName('Riul'))
    for (let i = 0; i < 300; i++) expect(v.is(AvatarSchema, fromName(`player ${i}`))).toBe(true)
  })

  it('house bots speak in their own voice; the rest get one matching the body gender', () => {
    expect(voiceFor('Dona Cida', null)).toBe('dona_cida')
    expect(voiceFor('Tonhão (bot)', null)).toBe('tonhao')
    expect(voiceFor('Riul', { ...DEFAULT_AVATAR, voice: 'jessica' })).toBe('jessica')
    for (let i = 0; i < 100; i++) {
      const name = `player ${i}`
      expect(VOICES[voiceFor(name, null)].gender).toBe(fromName(name).body)
      expect(voiceFor(name, null)).toBe(voiceFor(name, null))
    }
  })

  it('every catalog part has its image strips generated', () => {
    const parts = sheets.parts as Record<string, { file: string }[]>
    for (const layers of Object.values(parts)) {
      for (const layer of layers) {
        expect(existsSync(join(__dirname, '../../public/avatar', layer.file))).toBe(true)
      }
    }
  })
})
