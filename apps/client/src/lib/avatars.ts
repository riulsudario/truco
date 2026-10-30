import {
  AVATAR_OPTIONS,
  AvatarSchema,
  BOT_AVATARS,
  DEFAULT_AVATAR,
  VOICES,
  type Avatar,
  type VoiceId,
} from '@truco/protocol'
import * as v from 'valibot'
import { load, save } from './storage'

const KEY = 'truco:avatar'

/**
 * Look of whoever sits in a seat: house bots have their own (and a bot taking someone's
 * seat keeps that person's); whoever picked one in the editor uses it; everyone else gets a
 * look picked from the nickname, always the same for the same name.
 */
export function avatarFor(name: string, chosen: Avatar | null | undefined): Avatar {
  return BOT_AVATARS[name] ?? chosen ?? BOT_AVATARS[name.replace(/ \(bot\)$/, '')] ?? fromName(name)
}

/**
 * Voice of whoever sits in a seat: the look's voice (chosen or the house bot's) or, without
 * a choice, one matching the body gender, picked from the name so it is always the same.
 */
export function voiceFor(name: string, chosen: Avatar | null | undefined): VoiceId {
  const avatar = avatarFor(name, chosen)
  if (avatar.voice) return avatar.voice
  const options = (Object.keys(VOICES) as VoiceId[]).filter(
    (id) => VOICES[id].gender === avatar.body,
  )
  let hash = 2166136261
  for (const char of name) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  return options[hash % options.length]!
}

export function fromName(name: string): Avatar {
  let hash = 2166136261
  for (const char of name) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0
  const pick = <K extends keyof Avatar>(field: K): Avatar[K] => {
    const ids = Object.keys(AVATAR_OPTIONS[field]) as Avatar[K][]
    hash = Math.imul(hash ^ (hash >>> 13), 0x5bd1e995) >>> 0
    return ids[hash % ids.length]!
  }
  return {
    body: pick('body'),
    skin: pick('skin'),
    hair: pick('hair'),
    hairColor: pick('hairColor'),
    shirt: pick('shirt'),
    shirtColor: pick('shirtColor'),
    pants: pick('pants'),
    pantsColor: pick('pantsColor'),
    // Accessories only sometimes, so the table doesn't turn into a costume party.
    facialHair: hash % 3 === 0 ? pick('facialHair') : 'none',
    glasses: hash % 4 === 0 ? pick('glasses') : 'none',
    hat: hash % 5 === 0 ? pick('hat') : 'none',
    hatColor: pick('hatColor'),
  }
}

/** Look saved in this browser (or the default, if never edited or the saved one is invalid). */
export function loadMyAvatar(): Avatar {
  try {
    const result = v.safeParse(AvatarSchema, JSON.parse(load(KEY, 'null')))
    return result.success ? result.output : DEFAULT_AVATAR
  } catch {
    return DEFAULT_AVATAR
  }
}

export function saveMyAvatar(avatar: Avatar): void {
  save(KEY, JSON.stringify(avatar))
}
