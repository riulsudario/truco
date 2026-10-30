import { teamOf, type GameEvent, type PlayerView, type Seat } from '@truco/engine'
import type { VoiceId } from '@truco/protocol'
import { sound } from './sound.svelte'
import lines from './voice-lines.json'
import recorded from './voice-manifest.json'

/** Falas gritadas do pacote do time (scripts/build-voices.mjs), por momento do jogo. */
export type Moment = keyof typeof lines
export interface VoiceLine {
  file: string
  text: string
  /** Voz do personagem que grita; ausente nas falas do pacote do time. */
  voice?: VoiceId
}

/**
 * Tomadas aprovadas por personagem, instaladas pelo audio-pipeline (export.py --install).
 * Fala sem tomada na voz de quem grita cai no pacote do time.
 */
interface RecordedLine {
  id: string
  event: string
  text: string
  takes: Partial<Record<VoiceId, { variant: number; file: string }[]>>
}
const RECORDED = recorded.lines as RecordedLine[]

const STAKE_MOMENT: Record<number, Moment> = { 3: 'truco', 6: 'seis', 9: 'nove', 12: 'doze' }
/** Chance de alguém comemorar uma mão de 3 pontos ou mais (o fim do jogo sempre tem fala). */
const BIG_HAND_CHANCE = 0.5

/** Embaralha a semente: sementes vizinhas (mão 4 e 5) não podem cair em falas vizinhas. */
function mix(seed: number): number {
  let h = Math.imul(Math.abs(Math.floor(seed)) ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Escolhe a fala pela semente: assim o balão e o áudio batem, e todos na sala ouvem a mesma
 * fala, na mesma tomada, para o mesmo lance. Com voz, usa as gravações do personagem.
 */
export function pick(moment: Moment, seed: number, voice?: VoiceId): VoiceLine {
  if (voice) {
    const options = RECORDED.filter((line) => line.event === moment && line.takes[voice]?.length)
    if (options.length) {
      const line = options[mix(seed) % options.length]!
      const takes = line.takes[voice]!
      const take = takes[mix(seed + 1) % takes.length]!
      return { file: `vozes/${take.file}`, text: line.text, voice }
    }
  }
  const options = lines[moment]
  return options[Math.abs(Math.floor(seed)) % options.length]!
}

/** Arquivos das falas de aposta de uma voz: as que mais tocam, para carregar antes. */
export function commonLines(voice: VoiceId): string[] {
  return RECORDED.filter((line) => line.event === 'truco' || line.event === 'seis').flatMap(
    (line) => (line.takes[voice] ?? []).map((take) => `vozes/${take.file}`),
  )
}

export interface Spoken {
  seat: Seat
  line: VoiceLine
}

/**
 * Falas que os eventos do lote disparam: quem fala e o quê. Toca o áudio de cada uma.
 * `voices` diz a voz de cada cadeira.
 */
export function speak(events: GameEvent[], view: PlayerView, voices: VoiceId[]): Spoken[] {
  const me = view.seat
  const hand = view.hand.number
  const out: Spoken[] = []
  // Quem fala pelo time: o parceiro, se for o meu; senão o primeiro adversário depois de mim.
  const voiceOf = (team: 0 | 1): Seat | null => {
    if (me === null) return team === 0 ? 2 : 1
    return teamOf(me) === team ? (((me + 2) % 4) as Seat) : (((me + 1) % 4) as Seat)
  }
  const gameOver = events.some((e) => e.type === 'gameEnded')
  for (const event of events) {
    if (event.type === 'trucoCalled') {
      const moment = STAKE_MOMENT[event.stake] ?? 'truco'
      const seed = hand * 31 + event.seat * 7 + event.stake
      out.push({ seat: event.seat, line: pick(moment, seed, voices[event.seat]) })
    } else if (event.type === 'gameEnded' && me !== null) {
      const won = teamOf(me) === event.winner
      const seat = voiceOf(teamOf(me))!
      out.push({ seat, line: pick(won ? 'vitoria' : 'derrota', hand * 13 + seat, voices[seat]) })
    } else if (event.type === 'handEnded' && !gameOver) {
      const { winner, points } = event.result
      // Sorteio estável por mão, para todo mundo da sala ouvir (ou não) a mesma comemoração.
      const lucky = ((hand * 2654435761) >>> 0) / 4294967296 < BIG_HAND_CHANCE
      if (winner !== null && points >= 3 && lucky) {
        const seat = voiceOf(winner)!
        out.push({ seat, line: pick('vitoria', hand * 17 + seat, voices[seat]) })
      }
    }
  }
  for (const { line } of out) sound.playVoice(line.file, line.voice)
  return out
}
