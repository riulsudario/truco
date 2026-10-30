<script lang="ts">
  import type { Seat } from '@truco/engine'
  import type { Difficulty, PlayerInfo, Visibility } from '@truco/protocol'
  import type { OnlineSession } from '../lib/online-session.svelte'
  import { t } from '../lib/strings'
  import { AUDIENCE } from '../lib/session.svelte'
  import Jukebox from './Jukebox.svelte'
  import VolumeMenu from './VolumeMenu.svelte'
  import ShoutText from './ShoutText.svelte'
  import TauntBar from './TauntBar.svelte'

  interface Props {
    session: OnlineSession
  }

  let { session }: Props = $props()

  const room = $derived(session.room!)
  const owner = $derived(session.isOwner)
  const me = $derived(session.me)
  const spectators = $derived(room.players.filter((p) => p.seat === null))
  const teams: [string, Seat[]][] = [
    [t.teamUs, [0, 2]],
    [t.teamThem, [1, 3]],
  ]

  let copied = $state(false)
  let editing = $state(false)
  let form = $state({
    name: '',
    visibility: 'public' as Visibility,
    password: '',
    difficulty: 'normal' as Difficulty,
    spectators: true,
  })

  const playerById = (id: string) => room.players.find((p) => p.id === id)

  function openSettings() {
    form = {
      name: room.name,
      visibility: room.visibility,
      password: '',
      difficulty: room.difficulty,
      spectators: room.spectators,
    }
    editing = true
  }

  function saveSettings(event: SubmitEvent) {
    event.preventDefault()
    session.send({
      t: 'settings',
      settings: {
        name: form.name.trim() || room.name,
        visibility: form.visibility,
        difficulty: form.difficulty,
        spectators: form.spectators,
        // An empty field keeps the current password; removing it has its own button.
        ...(form.password.trim() ? { password: form.password.trim() } : {}),
      },
    })
    editing = false
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/sala/${room.code}`)
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      // no clipboard (http outside localhost); the code is on screen
    }
  }

  function moveTarget(player: PlayerInfo, value: string) {
    session.send({
      t: 'move',
      playerId: player.id,
      seat: value === 'null' ? null : (Number(value) as Seat),
    })
  }
</script>

{#snippet badges(player: PlayerInfo)}
  {#if player.id === room.ownerId}<span class="badge gold">{t.owner}</span>{/if}
  {#if !player.connected}<span class="badge off">{t.offline}</span>{/if}
  {#if player.ready}<span class="badge ok">{t.ready}</span>{/if}
{/snippet}

{#snippet ownerTools(player: PlayerInfo)}
  {#if owner && player.id !== session.playerId}
    <div class="tools">
      <select
        aria-label={t.moveTo}
        onchange={(e) => moveTarget(player, e.currentTarget.value)}
        value={String(player.seat)}
      >
        {#each [0, 1, 2, 3] as seat (seat)}
          <option value={String(seat)}>{t.moveTo} {seat + 1}</option>
        {/each}
        {#if room.spectators || player.seat === null}
          <option value="null">{t.watch}</option>
        {/if}
      </select>
      <button class="mini" onclick={() => session.send({ t: 'owner', playerId: player.id })}
        >{t.makeOwner}</button
      >
      <button class="mini danger" onclick={() => session.send({ t: 'kick', playerId: player.id })}
        >{t.kick}</button
      >
    </div>
  {/if}
{/snippet}

<Jukebox {session} withTv />
<main class="waiting">
  <header>
    <div>
      <h2>{room.name}</h2>
      <p class="code">
        {t.code}: <b>{room.code}</b>
        <button class="mini" onclick={copyLink}>{copied ? t.copied : t.copyLink}</button>
      </p>
    </div>
    <div class="header-actions">
      <VolumeMenu />
      <button class="btn" onclick={() => session.close()}>{t.leave}</button>
    </div>
  </header>

  <section class="teams">
    {#each teams as [label, seats] (label)}
      <div class="team">
        <h3>{label}</h3>
        {#each seats as seat (seat)}
          {@const info = room.seats[seat]!}
          <div class="seat" class:mine={me?.seat === seat}>
            {#if session.shouts[seat]}<span class="shout"
                ><ShoutText text={session.shouts[seat]} /></span
              >{/if}
            <span class="number">{seat + 1}</span>
            {#if info.kind === 'human'}
              {@const player = playerById(info.playerId)}
              {#if player}
                <span class="who">{player.nick} {@render badges(player)}</span>
                {@render ownerTools(player)}
              {/if}
            {:else if info.kind === 'bot'}
              <span class="who">🤖 {info.name}</span>
              {#if owner}
                <button class="mini" onclick={() => session.send({ t: 'bot', seat, add: false })}
                  >{t.removeBot}</button
                >
              {/if}
            {:else}
              <span class="who muted">{t.emptySeat}</span>
              <div class="tools">
                <button class="mini" onclick={() => session.send({ t: 'sit', seat })}
                  >{t.sitHere}</button
                >
                {#if owner}
                  <button class="mini" onclick={() => session.send({ t: 'bot', seat, add: true })}
                    >{t.addBot}</button
                  >
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </section>

  {#if spectators.length}
    <section class="spectators">
      <h3>{t.spectators}</h3>
      {#if session.shouts[AUDIENCE]}<span class="shout"
          ><ShoutText text={session.shouts[AUDIENCE]} /></span
        >{/if}
      {#each spectators as player (player.id)}
        <div class="seat">
          <span class="who">{player.nick} {@render badges(player)}</span>
          {@render ownerTools(player)}
        </div>
      {/each}
    </section>
  {/if}

  <p class="hint">{t.emptyFillsWithBots}</p>

  <section class="actions">
    {#if me?.seat !== null && me}
      <button class="btn" onclick={() => session.send({ t: 'ready', ready: !me.ready })}
        >{me.ready ? `✔ ${t.ready}` : t.notReady}</button
      >
      {#if room.spectators}
        <button class="btn" onclick={() => session.send({ t: 'stand' })}>{t.stand}</button>
      {/if}
    {/if}
    <TauntBar ontaunt={(id) => session.taunt(id)} />
  </section>

  {#if owner}
    <section class="owner">
      <button class="btn primary big" onclick={() => session.send({ t: 'start' })}>{t.start}</button
      >
      <div class="row">
        <button class="btn" onclick={openSettings}>⚙ {t.configure}</button>
        <button class="btn danger" onclick={() => session.send({ t: 'close' })}
          >{t.closeRoom}</button
        >
      </div>
    </section>
  {/if}

  {#if editing}
    <form class="settings" onsubmit={saveSettings}>
      <label class="field">
        <span>{t.roomName}</span>
        <input bind:value={form.name} maxlength="32" />
      </label>
      <fieldset class="field">
        <legend>{t.visibility}</legend>
        <div class="chips">
          {#each Object.entries(t.visibilities) as [id, label] (id)}
            <label class="chip" class:on={form.visibility === id}>
              <input type="radio" bind:group={form.visibility} value={id} />{label}
            </label>
          {/each}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>{t.difficulty}</legend>
        <div class="chips">
          {#each Object.entries(t.difficulties) as [id, label] (id)}
            <label class="chip" class:on={form.difficulty === id}>
              <input type="radio" bind:group={form.difficulty} value={id} />{label}
            </label>
          {/each}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>{t.allowSpectators}</legend>
        <div class="chips">
          <label class="chip" class:on={form.spectators}>
            <input type="radio" bind:group={form.spectators} value={true} />{t.yesNo.yes}
          </label>
          <label class="chip" class:on={!form.spectators}>
            <input type="radio" bind:group={form.spectators} value={false} />{t.yesNo.no}
          </label>
        </div>
      </fieldset>
      <label class="field">
        <span>{t.password}</span>
        <input
          bind:value={form.password}
          maxlength="32"
          type="password"
          autocomplete="new-password"
          placeholder={room.hasPassword ? t.keepPassword : ''}
        />
      </label>
      {#if room.hasPassword}
        <button
          class="mini"
          type="button"
          onclick={() => session.send({ t: 'settings', settings: { password: null } })}
          >{t.removePassword}</button
        >
      {/if}
      <div class="row">
        <button class="btn primary" type="submit">{t.save}</button>
        <button class="btn" type="button" onclick={() => (editing = false)}>{t.back}</button>
      </div>
    </form>
  {/if}
</main>

<style>
  .waiting {
    display: grid;
    gap: 14px;
    max-width: 560px;
    margin: 0 auto;
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 8px;
  }
  .header-actions {
    display: flex;
    gap: 8px;
  }
  h2 {
    margin: 0;
    color: var(--gold);
    font-size: 18px;
  }
  h3 {
    margin: 0 0 6px;
    font-size: 16px;
  }
  .code b {
    font-family: var(--display);
    font-size: 20px;
    letter-spacing: 4px;
    color: var(--gold);
  }
  .teams {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 420px) {
    .teams {
      grid-template-columns: 1fr;
    }
  }
  .team,
  .spectators,
  .settings {
    background: var(--panel);
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    padding: 8px;
  }
  .settings {
    display: grid;
    gap: 12px;
  }
  .seat {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    align-items: center;
    padding: 6px;
    border: 2px dashed rgb(255 255 255 / 0.15);
    margin-bottom: 6px;
  }
  .seat {
    position: relative;
  }
  .spectators {
    position: relative;
  }
  /* Taunt balloon, in the corner of whoever spoke. */
  .shout {
    position: absolute;
    right: 6px;
    top: -12px;
    z-index: 2;
    background: var(--paper);
    color: var(--ink);
    border: 3px solid var(--ink);
    padding: 1px 8px;
    /* Recorded lines are whole sentences: they wrap instead of overflowing the screen. */
    width: max-content;
    max-width: 280px;
    text-align: center;
    animation: pop 160ms steps(3);
  }
  @keyframes pop {
    from {
      scale: 0.4;
    }
  }
  .seat.mine {
    border: 2px solid var(--gold);
  }
  .number {
    grid-row: 1 / 3;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    background: var(--ink);
    color: var(--gold);
  }
  .spectators .seat {
    grid-template-columns: 1fr;
  }
  .muted {
    opacity: 0.6;
  }
  .badge {
    font-size: 11px;
    padding: 0 4px;
    border: 2px solid var(--ink);
    color: var(--ink);
  }
  .gold {
    background: var(--gold);
  }
  .off {
    background: var(--them);
  }
  .ok {
    background: var(--us);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .mini,
  select {
    font: inherit;
    font-size: 12px;
    padding: 2px 6px;
    border: 2px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .danger {
    background: var(--them);
  }
  .hint {
    margin: 0;
    font-size: 13px;
    opacity: 0.7;
  }
  .actions,
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .owner {
    display: grid;
    gap: 8px;
  }
</style>
