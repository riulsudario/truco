<script lang="ts">
  import type { LobbyMessage, RoomSummary } from '@truco/protocol'
  import { t } from '../lib/strings'

  interface Props {
    onjoin: (code: string) => void
    oncreate: () => void
    onback: () => void
  }

  let { onjoin, oncreate, onback }: Props = $props()

  let rooms = $state<RoomSummary[] | null>(null)
  let code = $state('')

  $effect(() => {
    let ws: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const open = () => {
      const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
      ws = new WebSocket(`${protocol}://${location.host}/ws/lobby`)
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data as string) as LobbyMessage
        if (msg.t === 'rooms') rooms = msg.rooms
      }
      ws.onclose = () => {
        if (!stopped) retry = setTimeout(open, 2000)
      }
    }
    open()
    return () => {
      stopped = true
      clearTimeout(retry)
      ws?.close()
    }
  })

  function submitCode(event: SubmitEvent) {
    event.preventDefault()
    const clean = code.trim().toUpperCase()
    if (/^[A-Z]{4}$/.test(clean)) onjoin(clean)
  }
</script>

<main class="lobby">
  <header>
    <button class="btn" onclick={onback}>← {t.back}</button>
    <button class="btn primary" onclick={oncreate}>{t.createRoom}</button>
  </header>

  <form class="code" onsubmit={submitCode}>
    <label for="code">{t.joinByCode}</label>
    <div class="row">
      <input
        id="code"
        bind:value={code}
        maxlength="4"
        placeholder={t.codePlaceholder}
        autocomplete="off"
        autocapitalize="characters"
      />
      <button class="btn" type="submit">{t.enter}</button>
    </div>
  </form>

  <h2>{t.rooms}</h2>
  {#if rooms === null}
    <p class="muted">{t.connecting}</p>
  {:else if rooms.length === 0}
    <p class="muted">{t.noRooms}</p>
  {:else}
    <ul class="rooms">
      {#each rooms as room (room.code)}
        <li>
          <button class="room" onclick={() => onjoin(room.code)}>
            <span class="name">{room.name}{room.hasPassword ? ' 🔒' : ''}</span>
            <span class="meta">
              {t.people(room.humans)} · {t.bots(room.bots)}{room.spectators
                ? ''
                : ` · ${t.noSpectators}`}
            </span>
            <span class="status" class:playing={room.status === 'playing'}>
              {room.status === 'playing' ? t.playing : t.waitingStatus}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .lobby {
    display: grid;
    gap: 14px;
    max-width: 480px;
    margin: 0 auto;
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
  }
  h2 {
    margin: 8px 0 0;
    color: var(--gold);
  }
  .code {
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .code input {
    flex: 1;
    font: inherit;
    font-size: 22px;
    letter-spacing: 6px;
    text-transform: uppercase;
    padding: 6px 10px;
    border: 3px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    min-width: 0;
  }
  .muted {
    opacity: 0.7;
  }
  .rooms {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .room {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
    text-align: left;
    font: inherit;
    color: var(--paper);
    background: var(--panel);
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    padding: 8px 10px;
    cursor: pointer;
  }
  .room:hover,
  .room:focus-visible {
    border-color: var(--gold);
    outline: none;
  }
  .name {
    font-size: 18px;
  }
  .meta {
    grid-column: 1;
    font-size: 13px;
    opacity: 0.8;
  }
  .status {
    grid-row: 1 / 3;
    grid-column: 2;
    align-self: center;
    color: var(--us);
  }
  .status.playing {
    color: var(--them);
  }
</style>
