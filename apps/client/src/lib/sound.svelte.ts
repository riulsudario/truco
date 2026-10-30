import { teamOf, type GameEvent, type Seat } from '@truco/engine'
import type { TauntId, VoiceId } from '@truco/protocol'
import { load, save } from './storage'

/** Sound effects (Kenney, CC0): cards and chips from the casino pack, cues from the interface one. */
const SFX = {
  play: ['card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'],
  deal: ['card-shuffle'],
  roundUs: ['chips-stack-1'],
  roundThem: ['chips-handle-3'],
  handUs: ['chips-collide-1'],
  accept: ['confirmation_001'],
  ran: ['drop_002'],
  runVote: ['question_001'],
  taunt: ['pluck_001'],
  turn: ['tick_002'],
  win: ['confirmation_004'],
  lose: ['error_005'],
} as const

export type SoundName = keyof typeof SFX

/** Each emoji's sound, matching its emotion; phrases use the default taunt sound. */
const EMOJI_SOUND: Partial<Record<TauntId, string>> = {
  laugh: 'emoji/laugh',
  angry: 'emoji/angry',
  cry: 'emoji/cry',
  fire: 'emoji/fire',
  heart: 'emoji/heart',
  skull: 'emoji/skull',
  eyes: 'emoji/eyes',
  clap: 'emoji/clap',
}

/** Full slider = this much of the file's loudness: at 100% the table was too loud. */
export const OUTPUT_SCALE = 0.5

/** Max simultaneous lines: any more and the table turns into noise nobody understands. */
const MAX_VOICES = 2

/** Opus is smaller; old Safari can't play it, so recorded lines also ship as MP3. */
const VOICE_EXT =
  typeof Audio !== 'undefined' && new Audio().canPlayType('audio/ogg; codecs=opus') ? 'ogg' : 'mp3'

function loadList(key: string): VoiceId[] {
  try {
    const list: unknown = JSON.parse(load(key, '[]'))
    return Array.isArray(list) ? (list as VoiceId[]) : []
  } catch {
    return []
  }
}

class Sound {
  /** Effects volume, 0 to 1; 0 is mute. Saved in this browser. */
  volume = $state(Number(load('truco:sfx', '0.6')) || 0)
  /** Recorded lines volume, separate from the effects. */
  voiceVolume = $state(Number(load('truco:voice-volume', '0.8')) || 0)
  /** Characters muted by whoever plays in this browser. */
  mutedVoices = $state<VoiceId[]>(loadList('truco:muted-voices'))
  private cache = new Map<string, HTMLAudioElement>()
  private speaking = new Set<HTMLAudioElement>()

  setVolume(volume: number): void {
    this.volume = volume
    save('truco:sfx', String(volume))
  }

  setVoiceVolume(volume: number): void {
    this.voiceVolume = volume
    save('truco:voice-volume', String(volume))
  }

  toggleVoice(voice: VoiceId): void {
    this.mutedVoices = this.mutedVoices.includes(voice)
      ? this.mutedVoices.filter((id) => id !== voice)
      : [...this.mutedVoices, voice]
    save('truco:muted-voices', JSON.stringify(this.mutedVoices))
  }

  /**
   * Recorded line. The team pack's lines only exist as OGG; the characters', as OGG and MP3.
   * Past the simultaneous-lines limit, the new one doesn't play (the balloon shows anyway).
   */
  playVoice(file: string, voice?: VoiceId): void {
    if (this.voiceVolume <= 0 || typeof Audio === 'undefined') return
    if (voice && this.mutedVoices.includes(voice)) return
    if (this.speaking.size >= MAX_VOICES) return
    const audio = this.element(voice ? `${file}.${VOICE_EXT}` : `${file}.ogg`)
    audio.volume = this.voiceVolume * OUTPUT_SCALE
    this.speaking.add(audio)
    const done = () => this.speaking.delete(audio)
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener('error', done, { once: true })
    void audio.play().catch(done)
  }

  /** Preloads the most played lines, so the shout isn't late on the first truco. */
  preloadVoices(files: string[]): void {
    if (typeof Audio === 'undefined') return
    for (const file of files) this.base(`${file}.${VOICE_EXT}`)
  }

  private base(path: string): HTMLAudioElement {
    let base = this.cache.get(path)
    if (!base) {
      base = new Audio(`/sfx/${path}`)
      base.preload = 'auto'
      this.cache.set(path, base)
    }
    return base
  }

  /** One clone per play, so repeated sounds can overlap. */
  private element(path: string): HTMLAudioElement {
    return this.base(path).cloneNode() as HTMLAudioElement
  }

  /** Taunt sound: emojis have their own; phrases use the default. */
  taunt(id: TauntId): void {
    const file = EMOJI_SOUND[id]
    if (file) this.playFile(file)
    else this.play('taunt')
  }

  play(name: SoundName): void {
    const options = SFX[name]
    this.playFile(options[Math.floor(Math.random() * options.length)]!)
  }

  playFile(file: string): void {
    if (this.volume <= 0 || typeof Audio === 'undefined') return
    const audio = this.element(`${file}.ogg`)
    audio.volume = this.volume * OUTPUT_SCALE
    // Without a user gesture the browser may block it; the game carries on silently.
    void audio.play().catch(() => {})
  }

  /** Sound for each happening in the batch, from the point of view of whoever sits in `me`. */
  forEvents(events: GameEvent[], me: Seat | null): void {
    const ours = (team: 0 | 1) => me !== null && teamOf(me) === team
    for (const event of events) {
      switch (event.type) {
        case 'handStarted':
          this.play('deal')
          break
        case 'cardPlayed':
          this.play('play')
          break
        case 'roundEnded':
          if (event.result !== 'tie') this.play(ours(event.result) ? 'roundUs' : 'roundThem')
          break
        case 'trucoAccepted':
          this.play('accept')
          break
        case 'runVoted':
          this.play('runVote')
          break
        case 'ran':
          this.play('ran')
          break
        case 'handEnded':
          if (event.result.winner !== null && ours(event.result.winner)) this.play('handUs')
          break
        case 'gameEnded':
          this.play(ours(event.winner) ? 'win' : 'lose')
          break
      }
    }
  }
}

export const sound = new Sound()
