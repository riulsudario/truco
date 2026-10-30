import { AVATAR_OPTIONS, AvatarSchema, BOT_AVATARS, DEFAULT_AVATAR, VOICES } from '@truco/protocol'
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

  it('the generated manifest knows every option of the catalog (rerun build-avatar after renaming ids)', () => {
    const parts = sheets.parts as Record<string, unknown>
    const fields = ['hair', 'shirt', 'pants', 'facialHair', 'glasses', 'hat'] as const
    for (const body of Object.keys(AVATAR_OPTIONS.body)) {
      expect(parts).toHaveProperty([`base:${body}`])
      for (const field of fields) {
        for (const id of Object.keys(AVATAR_OPTIONS[field])) {
          expect(parts).toHaveProperty([`${field}:${id}:${body}`])
        }
      }
    }
    for (const field of ['skin', 'hairColor', 'shirtColor'] as const) {
      const material = { skin: 'body', hairColor: 'hair', shirtColor: 'cloth' }[field]
      const colors = sheets.palettes[material as keyof typeof sheets.palettes].colors
      for (const option of Object.values(AVATAR_OPTIONS[field])) {
        expect(colors).toHaveProperty([option.palette])
      }
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
