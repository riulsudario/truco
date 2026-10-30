<script lang="ts">
  import { nextStake, teamOf, type Seat } from '@truco/engine'
  import type { GameSession } from '../lib/session.svelte'
  import { callLabel, t } from '../lib/strings'
  import Card from './Card.svelte'
  import Jukebox from './Jukebox.svelte'
  import JukeboxTV from './JukeboxTV.svelte'
  import Scene2D from './Scene2D.svelte'
  import TauntBar from './TauntBar.svelte'
  import VolumeMenu from './VolumeMenu.svelte'

  interface Props {
    session: GameSession
    onexit: () => void
    onrestart?: () => void
  }

  let { session, onexit, onrestart }: Props = $props()

  let hideNext = $state(false)
  let now = $state(Date.now())

  $effect(() => {
    if (!session.deadline) return
    const tick = setInterval(() => (now = Date.now()), 250)
    return () => clearInterval(tick)
  })

  const secondsLeft = $derived(
    session.deadline ? Math.max(0, Math.ceil((session.deadline - now) / 1000)) : null,
  )

  const view = $derived(session.view!)
  const me = $derived(view.seat ?? 0)
  const myTeam = $derived(teamOf(me))
  const hand = $derived(view.hand)
  const round = $derived(session.tableRound)

  const acting = $derived.by((): Seat[] => {
    if (view.phase !== 'playing') return []
    if (hand.elevenPending !== null)
      return ([0, 1, 2, 3] as Seat[]).filter((s) => teamOf(s) === hand.elevenPending)
    if (hand.truco) {
      const { team, runVotes } = hand.truco
      return ([0, 1, 2, 3] as Seat[]).filter((s) => teamOf(s) !== team && !runVotes.includes(s))
    }
    return [hand.turn]
  })

  const raiseTo = $derived(nextStake(hand.stake))
  const usScore = $derived(view.scores[myTeam])
  const themScore = $derived(view.scores[1 - myTeam]!)
  /** The strongest manilha, the zap: the manilha rank in clubs. */
  const zap = $derived({ rank: hand.manilha, suit: 'clubs' as const })

  const roundPips = $derived(
    [0, 1, 2].map((i) => {
      const result = hand.rounds[i]?.result ?? null
      if (result === null) return { label: t.round(i + 1), kind: 'open' }
      if (result === 'tie') return { label: t.tie, kind: 'tie' }
      return result === myTeam ? { label: t.us, kind: 'us' } : { label: t.them, kind: 'them' }
    }),
  )

  /** Headline under the scoreboard: whose move it is, or what is being asked of you. */
  const status = $derived.by((): { name?: string; text: string; mine?: boolean } | null => {
    if (view.phase !== 'playing') return null
    if (view.legal.accept)
      return { name: session.names[hand.truco!.caller] ?? '', text: t.called(hand.truco!.stake) }
    if (view.legal.eleven) return { text: t.elevenTitle, mine: true }
    if (hand.kind === 'iron') return { text: t.iron }
    if (acting.includes(me)) return { text: t.yourTurn, mine: true }
    if (hand.truco?.runVotes.includes(me))
      return { text: t.waitingPartnerRun(session.names[(me + 2) % 4] ?? '') }
    const seat = acting[0]
    if (seat === undefined) return null
    const deciding = hand.truco !== null || hand.elevenPending !== null
    return { name: session.names[seat] ?? '', text: deciding ? t.isDeciding : t.isPlaying }
  })

  const handBanner = $derived.by(() => {
    const last = view.lastHand
    if (view.phase === 'playing' || !last) return null
    if (last.winner === null) return t.handTied
    const text = last.winner === myTeam ? t.handWon(last.points) : t.handLost(last.points)
    const reason = t.reasons[last.reason]
    return reason ? `${text} (${reason})` : text
  })

  /**
   * Hand fan, held like the real thing: the cards overlap leaving each one's left corner
   * showing, and rotate around a point well below the hand.
   */
  function fan(index: number, count: number) {
    const offset = index - (count - 1) / 2
    return `rotate(${offset * 10}deg)`
  }

  function play(index: number) {
    session.act({ type: 'play', seat: me, index, hidden: hideNext && view.legal.hide })
    hideNext = false
  }
</script>

<Jukebox {session} />
<div class="table-screen">
  <div class="top">
    <ol class="pips" aria-label="Vazas">
      {#each roundPips as pip, i (i)}
        <li class={pip.kind}>{pip.label}</li>
      {/each}
    </ol>
    <div class="board">
      <div class="box stake">
        <span class="label">{t.worth}</span>
        <b>{hand.stake}</b>
      </div>
      <div class="box score" aria-label="Placar">
        <span class="label">{t.us}</span>
        <b class="us">{usScore}</b>
        <span class="x">×</span>
        <b class="them">{themScore}</b>
        <span class="label">{t.them}</span>
      </div>
      <div class="box trumps">
        <figure>
          <Card card={hand.vira} size="sm" />
          <figcaption>{t.vira}</figcaption>
        </figure>
        <figure aria-label="{t.manilha}: {t.ranks[hand.manilha]}">
          <div class="manilhas" aria-hidden="true"><Card card={zap} size="sm" /></div>
          <figcaption>{t.manilha}</figcaption>
        </figure>
      </div>
    </div>
    {#if status}
      <p class="status" class:mine={status.mine} aria-live="polite">
        {#if status.name}<span class="who">{status.name}</span>{/if}
        {status.text}
        {#if secondsLeft !== null && acting.includes(me)}
          <span class="clock" class:urgent={secondsLeft <= 5}>{t.timeLeft(secondsLeft)}</span>
        {/if}
      </p>
    {/if}
    {#if view.legal.eleven}
      <div class="decision">
        <p>{t.elevenHint}</p>
        <div class="partner-cards">
          {#each hand.partnerCards ?? [] as card, i (i)}
            <Card {card} manilha={hand.manilha} size="sm" />
          {/each}
        </div>
        <div class="row">
          <button
            class="btn primary"
            onclick={() => session.act({ type: 'eleven', seat: me, accept: true })}
            >{t.elevenPlay}</button
          >
          <button
            class="btn"
            onclick={() => session.act({ type: 'eleven', seat: me, accept: false })}
            >{t.elevenRun}</button
          >
        </div>
      </div>
    {:else if view.legal.accept}
      <div class="decision">
        {#if hand.truco!.runVotes.length}
          <p>{t.partnerWantsToRun(session.names[hand.truco!.runVotes[0]!] ?? '')}</p>
        {/if}
        <div class="row">
          <button class="btn" onclick={() => session.act({ type: 'run', seat: me })}>{t.run}</button
          >
          <button class="btn primary" onclick={() => session.act({ type: 'accept', seat: me })}
            >{t.accept}</button
          >
        </div>
      </div>
    {/if}
  </div>

  <div class="corner">
    <button class="btn" onclick={onexit}>🚪 {t.leaveTable}</button>
    <VolumeMenu />
  </div>

  <Scene2D
    {hand}
    {me}
    {round}
    names={session.names}
    avatars={session.avatars}
    shouts={session.shouts}
    {acting}
    banner={handBanner}
    events={session.lastEvents}
  >
    {#snippet tv({ width, height })}<JukeboxTV {session} {width} {height} />{/snippet}
  </Scene2D>

  {#if view.phase === 'gameOver'}
    <!-- Box in the middle of the screen, over the table, in both screen orientations. -->
    <div class="game-over" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
      <h2 id="game-over-title">{view.winner === myTeam ? t.gameWon : t.gameLost}</h2>
      <p class="final">{t.us} {usScore} × {themScore} {t.them}</p>
      <div class="row">
        {#if onrestart}<button class="btn primary" onclick={onrestart}>{t.playAgain}</button>{/if}
        <button class="btn" onclick={onexit}>{t.backToMenu}</button>
      </div>
    </div>
  {/if}

  <div class="bottom" class:gone={view.phase === 'gameOver'}>
    <div class="side left">
      {#if view.legal.hide}
        <label class="toggle"><input type="checkbox" bind:checked={hideNext} /> {t.hide}</label>
      {/if}
      {#if session.canTaunt}<TauntBar ontaunt={(id) => session.taunt(id)} />{/if}
    </div>
    <div class="my-hand" class:hiding={hideNext}>
      {#each hand.myCards as card, i (i)}
        <div class="fan" style:transform={fan(i, hand.myCards.length)}>
          <Card
            {card}
            manilha={hand.manilha}
            size="lg"
            disabled={!view.legal.play}
            onclick={() => play(i)}
          />
        </div>
      {/each}
    </div>
    <div class="side right">
      {#if view.legal.truco && raiseTo}
        <button class="btn hud-btn call" onclick={() => session.act({ type: 'truco', seat: me })}
          >{callLabel(raiseTo)}</button
        >
      {/if}
    </div>
  </div>

  {#if session.log.length}
    <aside class="log" aria-label={t.logTitle}>
      <h3>{t.logTitle}</h3>
      <ol>
        {#each session.log as line, i (i)}
          <li>{line}</li>
        {/each}
      </ol>
    </aside>
  {/if}
</div>

<style>
  .table-screen {
    --hud: rgb(26 20 35 / 0.88);
    display: grid;
    grid-template-rows: auto auto 1fr auto auto;
    gap: 8px;
    min-height: 100dvh;
    max-width: 560px;
    margin: 0 auto;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  }

  /* Scoreboard: rounds, then stake · score · vira and manilha, then whose move it is. */
  .top {
    display: grid;
    justify-items: center;
    gap: 8px;
  }
  .pips {
    display: flex;
    justify-content: center;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .pips li {
    min-width: 84px;
    text-align: center;
    padding: 3px 10px;
    border: 2px solid var(--ink);
    background: var(--hud);
    font-size: 12px;
    text-transform: uppercase;
  }
  .pips .us {
    background: var(--us);
    color: var(--ink);
  }
  .pips .them {
    background: var(--them);
    color: var(--ink);
  }
  .pips .tie {
    background: var(--gold);
    color: var(--ink);
  }
  .board {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }
  .box {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--hud);
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 rgb(0 0 0 / 0.45);
    padding: 6px 14px;
  }
  .label {
    font-size: 13px;
    text-transform: uppercase;
  }
  .box b {
    font-family: var(--display);
    font-weight: 400;
    font-size: 22px;
  }
  .stake b {
    color: var(--gold);
  }
  .score b.us {
    color: var(--us);
  }
  .score b.them {
    color: var(--them);
  }
  .x {
    opacity: 0.7;
  }
  .trumps {
    gap: 12px;
    padding: 4px 10px;
  }
  figure {
    margin: 0;
    display: grid;
    justify-items: center;
    gap: 2px;
  }
  figcaption {
    font-size: 10px;
    text-transform: uppercase;
  }
  .trumps :global(.card) {
    --w: 26px;
  }
  /* The zap on top of a little stack: the four cards of the manilha rank. */
  .manilhas {
    position: relative;
    display: flex;
    margin-left: 6px;
  }
  .manilhas::before,
  .manilhas::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--card-face);
    border: 2px solid var(--ink);
    border-radius: 3px;
  }
  .manilhas::before {
    translate: -6px 4px;
    rotate: -10deg;
  }
  .manilhas::after {
    translate: -3px 2px;
    rotate: -5deg;
  }
  .manilhas :global(.card) {
    position: relative;
    z-index: 1;
  }
  .status {
    margin: 0;
    font-family: var(--display);
    font-size: 14px;
    line-height: 1.4;
    text-align: center;
    text-transform: uppercase;
    background: var(--hud);
    padding: 4px 10px;
  }
  .status .who {
    color: rgb(244 236 216 / 0.6);
  }
  .status.mine {
    color: var(--gold);
  }
  .clock {
    color: var(--gold);
  }
  .clock.urgent {
    color: var(--them);
    animation: blink 0.5s steps(2) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0.4;
    }
  }

  .corner {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    order: -1;
  }
  .corner :global(.btn) {
    font-size: 14px;
    padding: 6px 10px;
  }

  .decision {
    justify-self: center;
    display: grid;
    gap: 10px;
    justify-items: center;
    text-align: center;
    background: var(--hud);
    border: 3px solid var(--gold);
    box-shadow: 4px 4px 0 rgb(0 0 0 / 0.5);
    padding: 12px 16px;
    max-width: 440px;
  }
  .decision p {
    margin: 0;
  }
  .partner-cards {
    display: flex;
    gap: 6px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 8px;
  }

  /* Bottom: taunts and the hide toggle left of your hand, the truco call right of it. */
  .bottom {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: end;
    gap: 8px 16px;
  }
  .bottom.gone {
    visibility: hidden;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 16px;
  }
  .side.left {
    align-items: end;
  }
  .side.right {
    align-items: start;
  }
  .bottom :global(.taunts .toggle),
  .hud-btn {
    font-size: 16px;
    padding: 10px 16px;
    text-transform: uppercase;
  }
  .call {
    background: var(--gold);
  }
  .toggle {
    display: flex;
    gap: 4px;
    align-items: center;
    background: var(--hud);
    padding: 2px 8px;
  }
  .my-hand {
    --card-w: 68px;
    position: relative;
    display: flex;
    min-height: 120px;
    align-items: end;
    padding-bottom: 12px;
  }
  .my-hand :global(.card) {
    --w: var(--card-w);
  }
  /* Each card covers most of the previous one: the corner with rank and suit remains. */
  .fan + .fan {
    margin-left: calc(var(--card-w) * -0.6);
  }
  .fan {
    transform-origin: 50% 140%;
  }
  .my-hand.hiding :global(button.card:not(:disabled):hover) {
    filter: brightness(0.6);
  }
  .log {
    display: none;
  }

  .game-over {
    position: fixed;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    z-index: 30;
    width: min(420px, calc(100vw - 32px));
    display: grid;
    gap: 12px;
    justify-items: center;
    text-align: center;
    background: var(--panel);
    border: 4px solid var(--gold);
    box-shadow:
      0 0 0 4px var(--ink),
      8px 8px 0 4px rgb(0 0 0 / 0.5);
    padding: 20px 16px;
  }
  .final {
    margin: 0;
    font-size: 18px;
  }
  .game-over h2 {
    margin: 0;
    color: var(--gold);
    font-size: clamp(18px, 5vw, 26px);
    line-height: 1.3;
  }

  /* Phone: the hand gets its own row, the buttons share the one below it. */
  @media (max-aspect-ratio: 5/4), (max-width: 759px) {
    /* Room for the jukebox button, docked in the bottom right corner. */
    .table-screen {
      padding-bottom: calc(64px + env(safe-area-inset-bottom));
    }
    .board {
      gap: 6px;
    }
    .box {
      padding: 4px 8px;
      gap: 6px;
    }
    .box b {
      font-size: 16px;
    }
    .my-hand {
      order: -1;
      flex-basis: 100%;
      justify-content: center;
    }
    .side {
      padding-bottom: 0;
    }
  }

  /*
   * Landscape: the scene fills the whole screen and the rest becomes a HUD over it, like a
   * first-person table game. Scoreboard top center, music top left, leave and volume top
   * right, log bottom left, your hand bottom center between taunts and the truco call.
   */
  @media (min-aspect-ratio: 5/4) and (min-width: 760px) {
    .table-screen {
      display: block;
      position: relative;
      max-width: none;
      height: 100dvh;
      padding: 0;
      overflow: hidden;
    }
    .top,
    .corner,
    .bottom,
    .log {
      position: absolute;
      z-index: 10;
    }
    .top {
      top: 16px;
      left: 50%;
      translate: -50% 0;
      gap: 12px;
    }
    .pips li {
      min-width: 110px;
    }
    .box {
      padding: 10px 22px;
      min-height: 76px;
    }
    .label {
      font-size: 16px;
    }
    .box b {
      font-size: 30px;
    }
    .score {
      gap: 14px;
    }
    .score b {
      font-size: 40px;
    }
    .trumps :global(.card) {
      --w: 32px;
    }
    .status {
      margin-top: 12px;
      font-size: clamp(18px, 1.7vw, 30px);
      background: none;
      text-shadow:
        3px 3px 0 var(--ink),
        0 0 12px rgb(0 0 0 / 0.8);
    }
    .corner {
      top: 16px;
      right: 16px;
      align-items: start;
    }
    .corner :global(.btn) {
      font-size: 15px;
      padding: 10px 16px;
      text-transform: uppercase;
    }
    .decision {
      max-width: 640px;
      background: none;
      border: 0;
      box-shadow: none;
      padding: 0;
      text-shadow: 2px 2px 0 var(--ink);
    }
    .decision p {
      font-size: 18px;
    }
    .decision .row {
      flex-wrap: nowrap;
      gap: 16px;
    }
    .decision :global(.btn) {
      min-width: 220px;
      font-size: 18px;
      padding: 12px 20px;
      text-transform: uppercase;
      text-shadow: none;
    }
    .bottom {
      left: 50%;
      bottom: 0;
      translate: -50% 0;
      width: min(1100px, calc(100vw - 2 * 300px));
      flex-wrap: nowrap;
      gap: 40px;
    }
    .side {
      padding-bottom: 72px;
    }
    .my-hand {
      --card-w: clamp(90px, 10vw, 150px);
      padding-bottom: 24px;
    }
    .log {
      display: block;
      left: 16px;
      bottom: 16px;
      width: 280px;
      background: var(--hud);
      border: 3px solid var(--ink);
      padding: 8px 10px;
      font-size: 15px;
    }
    .log h3 {
      margin: 0 0 4px;
      font-size: 12px;
      color: var(--gold);
      font-weight: 400;
    }
    .log ol {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 2px;
    }
    .log li:last-child {
      color: var(--gold);
    }
  }
</style>
