<script lang="ts">
  import type { Difficulty } from '@truco/bots'
  import CreateRoom from './components/CreateRoom.svelte'
  import Lobby from './components/Lobby.svelte'
  import RoomScreen from './components/RoomScreen.svelte'
  import Table from './components/Table.svelte'
  import { LocalSession } from './lib/local-session.svelte'
  import { router } from './lib/router.svelte'
  import type { GameSession } from './lib/session.svelte'
  import { load, save } from './lib/storage'
  import { t } from './lib/strings'

  let nick = $state(load('truco:nick', ''))
  let difficulty = $state(load('truco:difficulty', 'normal') as Difficulty)
  let session = $state<GameSession | null>(null)

  const nickOrDefault = $derived(nick.trim() || t.you)

  function remember() {
    save('truco:nick', nick.trim())
    save('truco:difficulty', difficulty)
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
    onjoin={(code) => router.go(`/sala/${code}`)}
    oncreate={() => router.go('/criar')}
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

    <label class="field">
      <span>{t.nickLabel}</span>
      <input bind:value={nick} maxlength="16" placeholder={t.nickPlaceholder} />
    </label>

    <fieldset class="field">
      <legend>{t.difficulty}</legend>
      <div class="chips">
        {#each Object.entries(t.difficulties) as [id, name] (id)}
          <label class="chip" class:on={difficulty === id}>
            <input type="radio" bind:group={difficulty} value={id} />
            {name}
          </label>
        {/each}
      </div>
    </fieldset>

    <button class="btn primary big" onclick={startPractice}>{t.practice}</button>
    <button
      class="btn big"
      onclick={() => {
        remember()
        router.go('/salas')
      }}>{t.online}</button
    >
  </main>
{/if}

<style>
  .menu {
    display: grid;
    gap: 16px;
    max-width: 380px;
    margin: 0 auto;
    padding: 32px 16px;
  }
  h1 {
    margin: 0 0 8px;
    text-align: center;
    font-size: 30px;
    line-height: 1.2;
    color: var(--gold);
    text-shadow:
      3px 3px 0 var(--ink),
      -1px -1px 0 var(--ink);
  }
  h1 small {
    display: block;
    font-size: 16px;
    color: var(--paper);
    text-shadow: 2px 2px 0 var(--ink);
    margin-top: 6px;
  }
</style>
