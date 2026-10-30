<script lang="ts">
  import { TAUNTS, type TauntId } from '@truco/protocol'
  import { t } from '../lib/strings'

  interface Props {
    ontaunt: (id: TauntId) => void
  }

  let { ontaunt }: Props = $props()
  let open = $state(false)

  function pick(id: TauntId) {
    ontaunt(id)
    open = false
  }
</script>

<div class="taunts">
  <button class="btn toggle" aria-expanded={open} onclick={() => (open = !open)}>
    💬 {t.taunts}
  </button>
  {#if open}
    <div class="menu" role="menu">
      <div class="emojis">
        {#each TAUNTS.filter((x) => x.kind === 'emoji') as taunt (taunt.id)}
          <button class="emoji" role="menuitem" onclick={() => pick(taunt.id)}>{taunt.text}</button>
        {/each}
      </div>
      <div class="phrases">
        {#each TAUNTS.filter((x) => x.kind === 'phrase') as taunt (taunt.id)}
          <button class="phrase" role="menuitem" onclick={() => pick(taunt.id)}>{taunt.text}</button
          >
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .taunts {
    position: relative;
  }
  .toggle {
    font-size: 14px;
    padding: 6px 10px;
  }
  .menu {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    z-index: 10;
    width: min(320px, 90vw);
    background: var(--panel);
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 var(--ink);
    padding: 8px;
    display: grid;
    gap: 8px;
  }
  .emojis {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }
  .emoji,
  .phrase {
    font: inherit;
    border: 2px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .emoji {
    font-size: 20px;
    padding: 2px 0;
  }
  .phrases {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .phrase {
    padding: 4px 8px;
    font-size: 14px;
  }
  .emoji:hover,
  .phrase:hover {
    background: var(--gold);
  }
</style>
