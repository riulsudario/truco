import {
  teamOf,
  type Action,
  type GameEvent,
  type PlayerView,
  type RoundView,
  type Seat,
} from '@truco/engine'
import { TAUNTS, type Avatar, type TauntId, type TrackId } from '@truco/protocol'
import { sound } from './sound.svelte'
import { voiceFor } from './avatars'
import { commonLines, speak } from './voice'
import { raiseLabel, t } from './strings'

/** Balão de quem não tem cadeira: a plateia. */
export const AUDIENCE = -1

export const tauntText = (id: TauntId) => TAUNTS.find((taunt) => taunt.id === id)?.text ?? ''

/** Quanto tempo a vaza fechada fica na mesa antes de recolher. */
export const ROUND_HOLD_MS = 1300
const SHOUT_MS = 1800
/** Balão de fala gravada fica mais tempo: é frase inteira, não uma palavra. */
const SPOKEN_MS = 3200
const LOG_SIZE = 6

/**
 * O que a mesa precisa para desenhar e jogar, venha o jogo do navegador (treino) ou do
 * servidor (online). A sessão recebe views e eventos e cuida só do ritmo da tela.
 */
export abstract class GameSession {
  view = $state.raw<PlayerView | null>(null)
  names = $state<string[]>(['', '', '', ''])
  /** Visual escolhido por quem senta em cada cadeira (null: sem escolha, sorteia pelo nome). */
  avatars = $state<(Avatar | null)[]>([null, null, null, null])
  /** Vaza mostrada na mesa: a fechada fica um tempo antes de dar lugar à nova. */
  heldRound = $state.raw<RoundView | null>(null)
  shouts = $state<Record<number, string>>({})
  /** Eventos do último lote recebido, para a cena animar quem agiu. */
  lastEvents = $state.raw<GameEvent[]>([])
  /** Últimas falas e acontecimentos da mesa, do mais antigo ao mais novo. */
  log = $state<string[]>([])
  /** Música tocando; startedAt já no relógio deste navegador (epoch ms). */
  jukebox = $state<{ trackId: TrackId | null; startedAt: number | null }>({
    trackId: null,
    startedAt: null,
  })
  /** Prazo (epoch ms) de quem está na vez, quando o servidor controla o relógio. */
  deadline = $state<number | null>(null)
  private shoutTimers: Record<number, ReturnType<typeof setTimeout>> = {}
  private holdTimer: ReturnType<typeof setTimeout> | undefined

  abstract act(action: Action): void
  abstract close(): void
  /** Provocações só existem no online; no treino não há para quem provocar. */
  readonly canTaunt: boolean = false
  /** No online a jukebox é da sala; no treino, só sua. */
  readonly sharedJukebox: boolean = false
  taunt(_id: TauntId): void {}
  /** Escolhe a música (null desliga). No online vale para a sala toda. */
  abstract chooseTrack(trackId: TrackId | null): void
  /** A faixa acabou: passa para a próxima. */
  abstract trackEnded(trackId: TrackId): void

  get tableRound(): RoundView | null {
    if (this.heldRound) return this.heldRound
    const rounds = this.view?.hand.rounds
    return rounds ? rounds[rounds.length - 1]! : null
  }

  /** Aplica uma view nova e anima os eventos que levaram até ela. */
  protected receive(view: PlayerView, events: GameEvent[]): void {
    // Remonta a vaza em andamento carta a carta para mostrar a que fechou neste lote.
    if (!this.view) this.log = [t.log.handStarted(view.hand.number, view.hand.kind)]
    let plays = [...(this.view?.hand.rounds.at(-1)?.plays ?? [])]
    for (const event of events) {
      this.animate(event)
      this.note(event, view)
      if (event.type === 'cardPlayed') {
        plays.push({ seat: event.seat, card: event.card, hidden: event.card === null })
      } else if (event.type === 'roundEnded') {
        this.hold({ plays, result: event.result })
        plays = []
      } else if (event.type === 'handStarted') {
        plays = []
      }
    }
    const wasMyTurn = this.view?.legal.play ?? false
    this.view = view
    if (events.length) this.lastEvents = events
    sound.forEvents(events, view.seat)
    // Falas gravadas: o balão mostra exatamente o que está sendo gritado.
    const voices = this.names.map((name, seat) => voiceFor(name, this.avatars[seat]))
    if (events.some((e) => e.type === 'handStarted')) {
      const distinct = voices.filter((voice, seat) => voices.indexOf(voice) === seat)
      sound.preloadVoices(distinct.flatMap(commonLines))
    }
    for (const { seat, line } of speak(events, view, voices)) this.shout(seat, line.text, SPOKEN_MS)
    if (view.legal.play && !wasMyTurn) sound.play('turn')
  }

  /** Balão em cima de uma cadeira (ou da plateia, com AUDIENCE). */
  shout(seat: Seat | typeof AUDIENCE, text: string, ms = SHOUT_MS): void {
    this.shouts[seat] = text
    clearTimeout(this.shoutTimers[seat])
    this.shoutTimers[seat] = setTimeout(() => delete this.shouts[seat], ms)
  }

  private animate(event: GameEvent): void {
    switch (event.type) {
      case 'trucoCalled':
        this.shout(event.seat, raiseLabel(event.stake))
        break
      case 'trucoAccepted':
        this.shout(event.seat, t.shouts.accept)
        break
      case 'ran':
        this.shout(event.seat, t.shouts.run)
        break
      case 'runVoted':
        this.shout(event.seat, t.shouts.wantsToRun)
        break
      case 'onzeDecided':
        this.shout(event.seat, event.accept ? t.shouts.onzeYes : t.shouts.onzeNo)
        break
      case 'cardPlayed':
      case 'handStarted':
        this.heldRound = null
        break
    }
  }

  private note(event: GameEvent, view: PlayerView): void {
    const me = view.seat
    const who = (seat: Seat) => (seat === me ? t.you : (this.names[seat] ?? ''))
    const ours = (team: 0 | 1) => me !== null && team === teamOf(me)
    let line: string | null = null
    switch (event.type) {
      case 'handStarted':
        line = t.log.handStarted(event.number, event.kind)
        break
      case 'trucoCalled':
        line = `${who(event.seat)}: ${raiseLabel(event.stake)}`
        break
      case 'trucoAccepted':
        line = `${who(event.seat)}: ${t.shouts.accept}`
        break
      case 'ran':
        line = t.log.ran(who(event.seat))
        break
      case 'runVoted':
        line = `${who(event.seat)}: ${t.shouts.wantsToRun}`
        break
      case 'onzeDecided':
        line = event.accept ? `${who(event.seat)}: ${t.shouts.onzeYes}` : t.log.ran(who(event.seat))
        break
      case 'roundEnded':
        line = event.result === 'tie' ? `${t.tie}!` : t.log.round(ours(event.result))
        break
      case 'handEnded': {
        const { winner, points } = event.result
        if (winner === null) line = t.handTied
        else line = ours(winner) ? t.handWon(points) : t.handLost(points)
        break
      }
      case 'gameEnded':
        line = ours(event.winner) ? t.gameWon : t.gameLost
        break
    }
    if (line) this.log = [...this.log, line].slice(-LOG_SIZE)
  }

  private hold(round: RoundView): void {
    this.heldRound = round
    clearTimeout(this.holdTimer)
    this.holdTimer = setTimeout(() => {
      if (this.view?.phase === 'playing') this.heldRound = null
    }, ROUND_HOLD_MS)
  }
}
