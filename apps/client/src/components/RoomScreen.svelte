<script lang="ts">
  import { OnlineSession } from '../lib/online-session.svelte'
  import { t } from '../lib/strings'
  import Table from './Table.svelte'
  import WaitingRoom from './WaitingRoom.svelte'

  interface Props {
    code: string
    nick: string
    onexit: () => void
  }

  let { code, nick, onexit }: Props = $props()

  let session = $state<OnlineSession | null>(null)
  let password = $state('')

  $effect(() => {
    const current = new OnlineSession(code, nick)
    session = current
    return () => current.close()
  })

  function leave() {
    session?.close()
    onexit()
  }

  function submitPassword(event: SubmitEvent) {
    event.preventDefault()
    session?.retryWithPassword(password)
  }

  const ended = $derived(session?.status === 'closed')
  const endMessage = $derived.by(() => {
    const reason = session?.endReason
    if (reason === 'kicked') return t.kicked
    if (reason === 'closed') return t.closed
    if (reason && reason !== 'left') return t.errors[reason]
    return t.closed
  })
</script>

{#if !session || (session.status === 'connecting' && !session.endReason)}
  <p class="center">{t.connecting}</p>
{:else if session.endReason === 'bad_password'}
  <form class="center password" onsubmit={submitPassword}>
    <p>{session.room ? t.errors.bad_password : t.passwordNeeded}</p>
    <input bind:value={password} type="password" maxlength="32" aria-label={t.password} />
    <div class="row">
      <button class="btn primary" type="submit">{t.enter}</button>
      <button class="btn" type="button" onclick={leave}>{t.back}</button>
    </div>
  </form>
{:else if ended}
  <div class="center">
    <p>{endMessage}</p>
    <button class="btn" onclick={onexit}>{t.backToMenu}</button>
  </div>
{:else if session.view}
  <Table
    {session}
    onexit={leave}
    onrestart={session.isOwner ? () => session?.send({ t: 'start' }) : undefined}
  />
{:else if session.room}
  <WaitingRoom {session} />
{/if}

{#if session?.status === 'reconnecting'}
  <div class="banner">{t.reconnecting}</div>
{/if}
{#if session?.error}
  <div class="banner error" role="alert">{t.errors[session.error]}</div>
{/if}

<style>
  .center {
    display: grid;
    gap: 12px;
    justify-items: center;
    text-align: center;
    padding: 64px 16px;
  }
  .password input {
    font: inherit;
    font-size: 18px;
    padding: 6px 10px;
    border: 3px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .banner {
    position: fixed;
    top: 12px;
    left: 50%;
    translate: -50% 0;
    z-index: 50;
    background: var(--ink);
    color: var(--gold);
    border: 3px solid var(--gold);
    padding: 6px 12px;
  }
  .banner.error {
    color: var(--paper);
    border-color: var(--them);
  }
</style>
