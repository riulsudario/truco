import { teamOf, type GameEvent, type Seat } from '@truco/engine'
import type { TauntId, VoiceId } from '@truco/protocol'
import { load, save } from './storage'

/** Efeitos sonoros (Kenney, CC0): cartas e fichas do pack de cassino, avisos do de interface. */
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

/** Som de cada emoji, conforme a emoção; frases usam o som padrão de provocação. */
const EMOJI_SOUND: Partial<Record<TauntId, string>> = {
  risada: 'emoji/risada',
  raiva: 'emoji/raiva',
  choro: 'emoji/choro',
  fogo: 'emoji/fogo',
  coracao: 'emoji/coracao',
  caveira: 'emoji/caveira',
  olhos: 'emoji/olhos',
  palmas: 'emoji/palmas',
}

/** Falas ao mesmo tempo, no máximo: com mais que isso a mesa vira barulho e ninguém entende. */
const MAX_VOICES = 2

/** Opus é menor; Safari antigo não toca, então as falas gravadas também saem em MP3. */
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
  /** Volume dos efeitos, de 0 a 1; 0 é mudo. Fica salvo neste navegador. */
  volume = $state(Number(load('truco:sfx', '0.6')) || 0)
  /** Volume das falas gravadas, separado dos efeitos. */
  voiceVolume = $state(Number(load('truco:voz', '0.8')) || 0)
  /** Personagens silenciados por quem joga neste navegador. */
  mutedVoices = $state<VoiceId[]>(loadList('truco:voz-mudas'))
  private cache = new Map<string, HTMLAudioElement>()
  private speaking = new Set<HTMLAudioElement>()

  setVolume(volume: number): void {
    this.volume = volume
    save('truco:sfx', String(volume))
  }

  setVoiceVolume(volume: number): void {
    this.voiceVolume = volume
    save('truco:voz', String(volume))
  }

  toggleVoice(voice: VoiceId): void {
    this.mutedVoices = this.mutedVoices.includes(voice)
      ? this.mutedVoices.filter((id) => id !== voice)
      : [...this.mutedVoices, voice]
    save('truco:voz-mudas', JSON.stringify(this.mutedVoices))
  }

  /**
   * Fala gravada. As do pacote do time só existem em OGG; as dos personagens, em OGG e MP3.
   * Passando do limite de falas simultâneas, a nova não toca (o balão aparece igual).
   */
  playVoice(file: string, voice?: VoiceId): void {
    if (this.voiceVolume <= 0 || typeof Audio === 'undefined') return
    if (voice && this.mutedVoices.includes(voice)) return
    if (this.speaking.size >= MAX_VOICES) return
    const audio = this.element(voice ? `${file}.${VOICE_EXT}` : `${file}.ogg`)
    audio.volume = this.voiceVolume
    this.speaking.add(audio)
    const done = () => this.speaking.delete(audio)
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener('error', done, { once: true })
    void audio.play().catch(done)
  }

  /** Baixa antes as falas que mais tocam, para o grito não chegar atrasado no primeiro truco. */
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

  /** Um clone por toque, para sons repetidos poderem se sobrepor. */
  private element(path: string): HTMLAudioElement {
    return this.base(path).cloneNode() as HTMLAudioElement
  }

  /** Som da provocação: o emoji tem o seu; frase usa o padrão. */
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
    audio.volume = this.volume
    // Sem gesto do usuário o navegador pode bloquear; o jogo segue em silêncio.
    void audio.play().catch(() => {})
  }

  /** Som de cada acontecimento do lote, do ponto de vista de quem senta em `me`. */
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
