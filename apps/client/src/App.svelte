<script lang="ts">
  import type { Difficulty } from '@truco/bots'
  import CreateRoom from './components/CreateRoom.svelte'
  import HowToPlay from './components/HowToPlay.svelte'
  import Lobby from './components/Lobby.svelte'
  import RoomScreen from './components/RoomScreen.svelte'
  import Table from './components/Table.svelte'
  import { LocalSession } from './lib/local-session.svelte'
  import { router } from './lib/router.svelte'
  import type { GameSession } from './lib/session.svelte'
  import { ICON_PIXELS, pixelPath } from './lib/pixels'
  import { load, save } from './lib/storage'
  import { t } from './lib/strings'

  let nick = $state(load('truco:nick', ''))
  /** Local match bots: the menu no longer asks, so it keeps the last choice (normal by default). */
  const difficulty = load('truco:difficulty', 'normal') as Difficulty
  let session = $state<GameSession | null>(null)
  let tutorial = $state(false)

  const nickOrDefault = $derived(nick.trim() || t.you)

  function remember() {
    save('truco:nick', nick.trim())
  }

  function startPractice() {
    remember()
    session?.close()
    session = new LocalSession(nick.trim(), difficulty)
  }

  function exit() {
    session?.close()
    session = null
  }
</script>

{#if router.roomCode}
  {#key router.roomCode}
    <RoomScreen code={router.roomCode} nick={nickOrDefault} onexit={() => router.go('/salas')} />
  {/key}
{:else if router.path === '/salas'}
  <Lobby
    bind:nick
    onjoin={(code) => {
      remember()
      router.go(`/sala/${code}`)
    }}
    oncreate={() => {
      remember()
      router.go('/criar')
    }}
    onback={() => router.go('/')}
  />
{:else if router.path === '/criar'}
  <CreateRoom
    nick={nick.trim()}
    oncreated={(code) => router.go(`/sala/${code}`)}
    onback={() => router.go('/salas')}
  />
{:else if session}
  <Table {session} onexit={exit} onrestart={startPractice} />
{:else}
  <main class="menu">
    <h1>{t.title}<small>{t.subtitle}</small></h1>

    <div class="modes">
      <button class="mode" onclick={startPractice}>
        <svg viewBox="0 0 9 9" aria-hidden="true"><path d={pixelPath(ICON_PIXELS.home)} /></svg>
        {t.practice}
      </button>
      <button class="mode" onclick={() => router.go('/salas')}>
        <svg viewBox="0 0 9 9" aria-hidden="true"><path d={pixelPath(ICON_PIXELS.globe)} /></svg>
        {t.online}
      </button>
    </div>

    <button class="link" onclick={() => (tutorial = true)}>{t.howToPlay}</button>
  </main>
  {#if tutorial}<HowToPlay onclose={() => (tutorial = false)} />{/if}
{/if}

<style>
  .menu {
    min-height: 100dvh;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 40px;
    padding: 32px 16px;
  }
  h1 {
    margin: 0;
    text-align: center;
    font-family: var(--display);
    font-weight: 400;
    font-size: clamp(28px, 6vw, 52px);
    line-height: 1.2;
    color: var(--gold);
    text-shadow:
      4px 4px 0 var(--ink),
      -1px -1px 0 var(--ink);
  }
  h1 small {
    display: block;
    font-family: 'Pixelify Sans', monospace;
    font-size: clamp(16px, 2.5vw, 22px);
    color: var(--paper);
    text-shadow: 2px 2px 0 var(--ink);
    margin-top: 12px;
  }
  .modes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 360px));
    gap: 40px;
    width: 100%;
    justify-content: center;
  }
  .mode {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 16px;
    min-height: 200px;
    font-family: var(--display);
    font-size: clamp(14px, 1.6vw, 20px);
    text-transform: uppercase;
    color: var(--paper);
    background: var(--panel);
    border: 4px solid var(--ink);
    box-shadow: 6px 6px 0 var(--ink);
    cursor: pointer;
  }
  .mode svg {
    width: 54px;
    height: 54px;
    fill: var(--gold);
  }
  .mode:hover,
  .mode:focus-visible {
    border-color: var(--gold);
    outline: none;
  }
  .mode:active {
    translate: 3px 3px;
    box-shadow: 3px 3px 0 var(--ink);
  }
  .link {
    font: inherit;
    font-size: 20px;
    color: var(--paper);
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 4px;
    cursor: pointer;
  }
  .link:hover,
  .link:focus-visible {
    color: var(--gold);
  }
  @media (max-width: 640px) {
    .modes {
      grid-template-columns: minmax(0, 360px);
      gap: 16px;
    }
    .mode {
      min-height: 120px;
    }
  }
</style>
