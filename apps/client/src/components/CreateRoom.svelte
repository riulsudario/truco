<script lang="ts">
  import type { Difficulty, RoomSettings, Visibility } from '@truco/protocol'
  import { playerToken } from '../lib/identity'
  import { t } from '../lib/strings'

  interface Props {
    nick: string
    oncreated: (code: string) => void
    onback: () => void
  }

  let { nick, oncreated, onback }: Props = $props()

  // Valores iniciais vêm das props; depois o formulário é dono deles.
  // svelte-ignore state_referenced_locally
  let name = $state(t.roomNameDefault(nick))
  let visibility = $state<Visibility>('publica')
  let password = $state('')
  let difficulty = $state<Difficulty>('normal')
  let busy = $state(false)
  let failed = $state<string | null>(null)

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    busy = true
    failed = null
    const settings: RoomSettings = {
      name: name.trim() || t.roomNameDefault(nick),
      visibility,
      password: password.trim() || null,
      difficulty,
    }
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings, token: playerToken() }),
      })
      if (response.status === 429) {
        failed = t.tooManyRooms
        return
      }
      if (!response.ok) throw new Error(String(response.status))
      const { code } = (await response.json()) as { code: string }
      oncreated(code)
    } catch {
      failed = t.createFailed
    } finally {
      busy = false
    }
  }
</script>

<main class="create">
  <button class="btn back" onclick={onback}>← {t.back}</button>
  <h2>{t.createRoom}</h2>
  <form onsubmit={submit}>
    <label class="field">
      <span>{t.roomName}</span>
      <input bind:value={name} maxlength="32" required />
    </label>

    <fieldset class="field">
      <legend>{t.visibility}</legend>
      <div class="chips">
        {#each Object.entries(t.visibilities) as [id, label] (id)}
          <label class="chip" class:on={visibility === id}>
            <input type="radio" bind:group={visibility} value={id} />{label}
          </label>
        {/each}
      </div>
    </fieldset>

    <label class="field">
      <span>{t.password}</span>
      <input bind:value={password} maxlength="32" type="password" autocomplete="new-password" />
    </label>

    <fieldset class="field">
      <legend>{t.difficulty}</legend>
      <div class="chips">
        {#each Object.entries(t.difficulties) as [id, label] (id)}
          <label class="chip" class:on={difficulty === id}>
            <input type="radio" bind:group={difficulty} value={id} />{label}
          </label>
        {/each}
      </div>
    </fieldset>

    {#if failed}<p class="error">{failed}</p>{/if}
    <button class="btn primary big" type="submit" disabled={busy}>{t.create}</button>
  </form>
</main>

<style>
  .create {
    max-width: 420px;
    margin: 0 auto;
    padding: 16px;
  }
  .back {
    margin-bottom: 8px;
  }
  h2 {
    color: var(--gold);
  }
  form {
    display: grid;
    gap: 14px;
  }
  .error {
    color: var(--them);
  }
</style>
