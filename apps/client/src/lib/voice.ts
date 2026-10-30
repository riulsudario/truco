import { teamOf, type GameEvent, type PlayerView, type Seat } from '@truco/engine'
import type { VoiceId } from '@truco/protocol'
import { sound } from './sound.svelte'
import lines from './voice-lines.json'
import recorded from './voice-manifest.json'

/** Shouted lines from the team pack (scripts/build-voices.mjs), by game moment. */
export type Moment = keyof typeof lines
export interface VoiceLine {
  file: string
  text: string
  /** Voice of the character shouting; absent for team pack lines. */
  voice?: VoiceId
}

/**
 * Approved takes per character, installed by the audio-pipeline (export.py --install).
 * A line with no take in the shouter's voice falls back to the team pack.
 */
interface RecordedLine {
  id: string
  event: string
  text: string
  takes: Partial<Record<VoiceId, { variant: number; file: string }[]>>
}
const RECORDED = recorded.lines as RecordedLine[]

const STAKE_MOMENT: Record<number, Moment> = { 3: 'truco', 6: 'six', 9: 'nine', 12: 'twelve' }
/** Chance of someone celebrating a hand worth 3+ points (the end of the game always has a line). */
const BIG_HAND_CHANCE = 0.5

/** Scrambles the seed: neighboring seeds (hands 4 and 5) must not land on neighboring lines. */
function mix(seed: number): number {
  let h = Math.imul(Math.abs(Math.floor(seed)) ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * Picks the line by seed: that way the balloon and the audio match, and everyone in the room
 * hears the same line, in the same take, for the same move. With a voice, it uses the
 * character's recordings.
 */
export function pick(moment: Moment, seed: number, voice?: VoiceId): VoiceLine {
  if (voice) {
    const options = RECORDED.filter((line) => line.event === moment && line.takes[voice]?.length)
    if (options.length) {
      const line = options[mix(seed) % options.length]!
      const takes = line.takes[voice]!
      const take = takes[mix(seed + 1) % takes.length]!
      return { file: `voices/${take.file}`, text: line.text, voice }
    }
  }
  const options = lines[moment]
  return options[Math.abs(Math.floor(seed)) % options.length]!
}

/** Files of a voice's betting lines: the most played ones, to preload. */
export function commonLines(voice: VoiceId): string[] {
  return RECORDED.filter((line) => line.event === 'truco' || line.event === 'six').flatMap((line) =>
    (line.takes[voice] ?? []).map((take) => `voices/${take.file}`),
  )
}

export interface Spoken {
  seat: Seat
  line: VoiceLine
}

/**
 * Lines triggered by the batch's events: who speaks and what. Plays each one's audio.
 * `voices` gives each seat's voice.
 */
export function speak(events: GameEvent[], view: PlayerView, voices: VoiceId[]): Spoken[] {
  const me = view.seat
  const hand = view.hand.number
  const out: Spoken[] = []
  // Who speaks for the team: the partner, if it's mine; otherwise the first opponent after me.
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
      out.push({ seat, line: pick(won ? 'win' : 'loss', hand * 13 + seat, voices[seat]) })
    } else if (event.type === 'handEnded' && !gameOver) {
      const { winner, points } = event.result
      // Stable draw per hand, so everyone in the room hears (or doesn't) the same celebration.
      const lucky = ((hand * 2654435761) >>> 0) / 4294967296 < BIG_HAND_CHANCE
      if (winner !== null && points >= 3 && lucky) {
        const seat = voiceOf(winner)!
        out.push({ seat, line: pick('win', hand * 17 + seat, voices[seat]) })
      }
    }
  }
  for (const { line } of out) sound.playVoice(line.file, line.voice)
  return out
}
