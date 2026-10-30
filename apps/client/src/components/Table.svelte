<script lang="ts">
  import { nextStake, teamOf, type Seat } from '@truco/engine'
  import type { GameSession } from '../lib/session.svelte'
  import { raiseLabel, t } from '../lib/strings'
  import Card from './Card.svelte'
  import Jukebox from './Jukebox.svelte'
  import JukeboxTV from './JukeboxTV.svelte'
  import Scene2D from './Scene2D.svelte'
  import TauntBar from './TauntBar.svelte'

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

  const raiseTo = $derived(nextStake(hand.truco?.stake ?? hand.stake))
  const usScore = $derived(view.scores[myTeam])
  const themScore = $derived(view.scores[1 - myTeam]!)

  const roundPips = $derived(
    [0, 1, 2].map((i) => {
      const result = hand.rounds[i]?.result ?? null
      if (result === null) return { label: t.round(i + 1), kind: 'open' }
      if (result === 'tie') return { label: t.tie, kind: 'tie' }
      return result === myTeam ? { label: t.us, kind: 'us' } : { label: t.them, kind: 'them' }
    }),
  )

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
  <header class="hud">
    <div class="score" aria-label="Placar">
      <span class="team us">{t.us} <b>{usScore}</b></span>
      <span class="x">×</span>
      <span class="team them"><b>{themScore}</b> {t.them}</span>
    </div>
    <div class="stake">
      {t.worth} <b>{hand.stake}</b>
    </div>
    <div class="vira">
      <span>{t.vira}</span>
      <Card card={hand.vira} size="sm" />
      <span class="manilha-label">{t.manilha}: <b>{t.ranks[hand.manilha]}</b></span>
    </div>
  </header>

  <ol class="pips" aria-label="Vazas">
    {#each roundPips as pip, i (i)}
      <li class={pip.kind}>{pip.label}</li>
    {/each}
  </ol>

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

  <section class="controls">
    <div class="actions">
      {#if view.phase === 'gameOver'}
        <!-- Box in the middle of the screen, over the table, in both screen orientations. -->
        <div class="game-over" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
          <h2 id="game-over-title">{view.winner === myTeam ? t.gameWon : t.gameLost}</h2>
          <p class="final">{t.us} {usScore} × {themScore} {t.them}</p>
          <div class="row">
            {#if onrestart}<button class="btn primary" onclick={onrestart}>{t.playAgain}</button
              >{/if}
            <button class="btn" onclick={onexit}>{t.backToMenu}</button>
          </div>
        </div>
      {:else if view.legal.eleven}
        <p class="prompt"><b>{t.elevenTitle}</b> {t.elevenHint}</p>
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
      {:else if view.legal.accept}
        <p class="prompt alert">{t.trucoAgainstUs(hand.truco!.stake)}</p>
        {#if hand.truco!.runVotes.length}
          <p class="prompt">{t.partnerWantsToRun(session.names[hand.truco!.runVotes[0]!] ?? '')}</p>
        {/if}
        <div class="row">
          <button class="btn primary" onclick={() => session.act({ type: 'accept', seat: me })}
            >{t.accept}</button
          >
          {#if view.legal.truco && raiseTo}
            <button class="btn hot" onclick={() => session.act({ type: 'truco', seat: me })}
              >{raiseLabel(raiseTo)}</button
            >
          {/if}
          <button class="btn" onclick={() => session.act({ type: 'run', seat: me })}>{t.run}</button
          >
        </div>
      {:else}
        <div class="row">
          <span class="status" class:mine={acting.includes(me)}>
            {#if hand.kind === 'iron'}{t.iron}
            {:else if acting.includes(me)}{t.yourTurn}
            {:else if hand.truco?.runVotes.includes(me)}{t.waitingPartnerRun(
                session.names[(me + 2) % 4] ?? '',
              )}
            {:else if acting.length}{t.waiting(session.names[acting[0]!] ?? '')}{/if}
          </span>
          {#if view.legal.hide}
            <label class="toggle"><input type="checkbox" bind:checked={hideNext} /> {t.hide}</label>
          {/if}
          {#if view.legal.truco && raiseTo}
            <button class="btn hot" onclick={() => session.act({ type: 'truco', seat: me })}
              >{raiseLabel(raiseTo)}</button
            >
          {/if}
        </div>
      {/if}

      {#if secondsLeft !== null && acting.includes(me) && view.phase === 'playing'}
        <div class="clock" class:urgent={secondsLeft <= 5}>{t.timeLeft(secondsLeft)}</div>
      {/if}
    </div>

    <div class="my-hand" class:hiding={hideNext} class:gone={view.phase === 'gameOver'}>
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
    {#if session.canTaunt}
      <div class="footer">
        <button class="btn small" onclick={onexit}>{t.leaveTable}</button>
        <TauntBar ontaunt={(id) => session.taunt(id)} />
      </div>
    {/if}
  </section>

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
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 8px;
    min-height: 100dvh;
    max-width: 560px;
    margin: 0 auto;
    padding: 10px 12px calc(12px + env(safe-area-inset-bottom));
  }
  .hud {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: var(--panel);
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 rgb(0 0 0 / 0.4);
    padding: 6px 10px;
  }
  .score {
    display: flex;
    gap: 6px;
    align-items: baseline;
    font-size: 18px;
  }
  .score b,
  .stake b {
    font-family: var(--display);
    font-size: 18px;
  }
  .us b {
    color: var(--us);
  }
  .them b {
    color: var(--them);
  }
  .stake b {
    color: var(--gold);
  }
  .vira {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .manilha-label b {
    color: var(--gold);
    font-size: 16px;
  }
  .pips {
    display: flex;
    justify-content: center;
    gap: 6px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .pips li {
    min-width: 64px;
    text-align: center;
    padding: 2px 8px;
    border: 2px solid var(--ink);
    background: var(--panel);
    font-size: 13px;
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
  .controls {
    display: grid;
    gap: 10px;
    justify-items: center;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }
  .prompt {
    margin: 0;
    text-align: center;
  }
  .alert {
    color: var(--gold);
    font-size: 20px;
  }
  /* Text outside the table gets a background so it reads well over any floor. */
  .status,
  .prompt,
  .clock {
    background: var(--panel);
    padding: 2px 8px;
  }
  .status:empty {
    display: none;
  }
  .status.mine {
    color: var(--gold);
  }
  .toggle {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .partner-cards {
    display: flex;
    gap: 6px;
  }
  .actions {
    display: grid;
    gap: 10px;
    justify-items: center;
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
  .log {
    display: none;
  }
  .fan {
    transform-origin: 50% 140%;
  }
  .my-hand.hiding :global(button.card:not(:disabled):hover) {
    filter: brightness(0.6);
  }
  .clock {
    font-size: 18px;
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
  /* Footer above your hands, so the buttons stay clickable. */
  .footer {
    position: relative;
    z-index: 3;
    width: 100%;
    display: flex;
    justify-content: space-between;
  }
  .small {
    font-size: 14px;
    padding: 6px 10px;
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
  .game-over .row {
    flex-direction: row;
  }
  .final {
    margin: 0;
    font-size: 18px;
  }
  .my-hand.gone {
    visibility: hidden;
  }
  .alert {
    font-family: var(--display);
    font-size: 15px;
  }
  .game-over h2 {
    margin: 0;
    color: var(--gold);
    font-size: clamp(18px, 5vw, 26px);
    line-height: 1.3;
  }

  /*
   * Landscape: the scene fills the whole screen and the rest becomes a HUD in the corners,
   * like a first-person table game. Score top left, leave/taunt top right, log bottom left,
   * buttons bottom right, your hand in the middle.
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
    .hud,
    .pips,
    .actions,
    .my-hand,
    .footer,
    .log {
      position: absolute;
      z-index: 10;
    }
    .hud {
      top: 16px;
      left: 16px;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
      min-width: 200px;
    }
    .score {
      justify-content: space-between;
      font-size: 20px;
    }
    .pips {
      top: 16px;
      left: 50%;
      translate: -50% 0;
    }
    .controls {
      display: contents;
    }
    .actions {
      right: 16px;
      bottom: 16px;
      width: 230px;
      justify-items: stretch;
      background: rgb(0 0 0 / 0.55);
      border: 3px solid var(--ink);
      padding: 10px;
    }
    .actions .row {
      flex-direction: column;
      align-items: stretch;
    }
    .actions :global(.btn) {
      font-size: 18px;
    }
    .my-hand {
      left: 50%;
      bottom: 0;
      translate: -50% 0;
      padding-bottom: 24px;
    }
    .my-hand {
      --card-w: clamp(90px, 10vw, 150px);
    }
    .footer {
      top: 16px;
      right: 16px;
      width: auto;
      gap: 8px;
    }
    .footer :global(.menu) {
      top: calc(100% + 6px);
      bottom: auto;
    }
    .log {
      display: block;
      left: 16px;
      bottom: 16px;
      width: 240px;
      background: rgb(0 0 0 / 0.55);
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
