<script lang="ts">
  import type { Card, Rank } from '@truco/engine'
  import { isRed, pixelPath, SUIT_PIXELS } from '../lib/pixels'
  import { t } from '../lib/strings'

  interface Props {
    card: Card | null
    manilha?: Rank | null
    size?: 'sm' | 'md' | 'lg'
    onclick?: () => void
    disabled?: boolean
  }

  let { card, manilha = null, size = 'md', onclick, disabled = false }: Props = $props()

  const isManilha = $derived(card !== null && card.rank === manilha)
  const label = $derived(card ? `${t.ranks[card.rank]} de ${t.suits[card.suit]}` : 'carta virada')
</script>

{#snippet face(c: Card)}
  <span class="corner">{t.ranks[c.rank]}</span>
  <svg class="suit" viewBox="0 0 7 7" aria-hidden="true">
    <path d={pixelPath(SUIT_PIXELS[c.suit])} />
  </svg>
  <span class="corner bottom">{t.ranks[c.rank]}</span>
{/snippet}

{#if onclick}
  <button
    class="card {size}"
    class:red={card && isRed(card.suit)}
    class:back={!card}
    class:manilha={isManilha}
    {disabled}
    aria-label={label}
    {onclick}
  >
    {#if card}{@render face(card)}{/if}
  </button>
{:else}
  <div
    class="card {size}"
    class:red={card && isRed(card.suit)}
    class:back={!card}
    class:manilha={isManilha}
    role="img"
    aria-label={label}
  >
    {#if card}{@render face(card)}{/if}
  </div>
{/if}

<style>
  .card {
    --w: 50px;
    position: relative;
    width: var(--w);
    aspect-ratio: 2 / 3;
    padding: 0;
    border: 3px solid var(--ink);
    background: var(--card-face);
    color: var(--ink);
    font: inherit;
    box-shadow:
      inset -3px -3px 0 var(--card-shade),
      3px 3px 0 rgb(0 0 0 / 0.35);
    display: grid;
    place-items: center;
    flex: none;
  }
  .sm {
    --w: 36px;
  }
  .lg {
    --w: 68px;
  }
  .red {
    color: var(--red);
  }
  .manilha {
    border-color: var(--gold);
    box-shadow:
      inset -3px -3px 0 var(--card-shade),
      0 0 0 3px var(--ink),
      3px 3px 0 3px rgb(0 0 0 / 0.35);
  }
  .back {
    background:
      repeating-linear-gradient(45deg, var(--back-a) 0 4px, var(--back-b) 4px 8px), var(--back-a);
    box-shadow:
      inset 0 0 0 3px var(--back-b),
      3px 3px 0 rgb(0 0 0 / 0.35);
  }
  .corner {
    position: absolute;
    top: 1px;
    left: 4px;
    font-size: calc(var(--w) * 0.32);
    line-height: 1;
  }
  .bottom {
    top: auto;
    left: auto;
    bottom: 1px;
    right: 4px;
    transform: rotate(180deg);
  }
  .suit {
    width: 50%;
    fill: currentColor;
    shape-rendering: crispEdges;
  }
  button.card {
    cursor: pointer;
    transition: transform 90ms steps(2);
  }
  button.card:not(:disabled):hover,
  button.card:not(:disabled):focus-visible {
    transform: translateY(-8px);
    outline: none;
  }
  button.card:disabled {
    cursor: default;
    filter: brightness(0.85);
  }
</style>
