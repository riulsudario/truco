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
 * Visual de quem senta numa cadeira: bots da casa têm o seu (e quem vira bot no lugar de
 * alguém mantém o da pessoa); quem escolheu no editor usa o escolhido; o resto ganha um
 * visual sorteado pelo apelido, sempre o mesmo para o mesmo nome.
 */
export function avatarFor(name: string, chosen: Avatar | null | undefined): Avatar {
  return BOT_AVATARS[name] ?? chosen ?? BOT_AVATARS[name.replace(/ \(bot\)$/, '')] ?? fromName(name)
}

/**
 * Voz de quem senta numa cadeira: a do visual (escolhida ou do bot da casa) ou, sem escolha,
 * uma do mesmo gênero do corpo, sorteada pelo nome para ser sempre a mesma.
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
    // Acessórios só às vezes, para a mesa não virar um baile de fantasia.
    facialHair: hash % 3 === 0 ? pick('facialHair') : 'nenhum',
    glasses: hash % 4 === 0 ? pick('glasses') : 'nenhum',
    hat: hash % 5 === 0 ? pick('hat') : 'nenhum',
    hatColor: pick('hatColor'),
  }
}

/** Visual salvo neste navegador (ou o padrão, se nunca editou ou se o salvo é inválido). */
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
