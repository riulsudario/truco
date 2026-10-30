<script lang="ts">
  import { t } from '../lib/strings'

  interface Props {
    onclose: () => void
  }

  let { onclose }: Props = $props()
  let dialog = $state<HTMLDialogElement>()

  $effect(() => {
    dialog?.showModal()
  })
</script>

<!-- Native dialog: Esc and the backdrop close it, focus stays inside while open. -->
<dialog
  bind:this={dialog}
  aria-labelledby="how-to-play-title"
  {onclose}
  onclick={(event) => event.target === dialog && dialog?.close()}
>
  <div class="body">
    <header>
      <h2 id="how-to-play-title">{t.tutorial.title}</h2>
      <button class="btn" onclick={() => dialog?.close()}>{t.tutorial.close}</button>
    </header>
    {#each t.tutorial.sections as section (section.title)}
      <section>
        <h3>{section.title}</h3>
        <p>{section.text}</p>
      </section>
    {/each}
  </div>
</dialog>

<style>
  dialog {
    width: min(720px, calc(100vw - 32px));
    max-height: calc(100dvh - 64px);
    padding: 0;
    color: var(--paper);
    background: var(--panel);
    border: 4px solid var(--gold);
    box-shadow:
      0 0 0 4px var(--ink),
      8px 8px 0 4px rgb(0 0 0 / 0.5);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.7);
  }
  .body {
    display: grid;
    gap: 16px;
    padding: 20px 24px 24px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 18px;
    font-weight: 400;
    color: var(--gold);
  }
  section {
    display: grid;
    gap: 4px;
  }
  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 400;
    color: var(--gold);
  }
  p {
    margin: 0;
    line-height: 1.45;
  }
</style>
