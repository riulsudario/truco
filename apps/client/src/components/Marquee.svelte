<script lang="ts">
  /**
   * One line of text that doesn't fit its box: cut with an ellipsis, and scrolling in a loop, like
   * a sign, while the pointer is over (or focus is on) the nearest `data-marquee-host`.
   */
  interface Props {
    text: string
  }

  let { text }: Props = $props()

  /** Scrolling speed, in pixels per second. */
  const SPEED = 30
  /** Space between the end of the text and its next lap. */
  const GAP = 32

  let box = $state<HTMLElement>()
  let first = $state<HTMLElement>()
  let width = $state(0)
  let fits = $state(true)

  $effect(() => {
    if (!box || !first) return
    void text
    const measure = () => {
      width = first!.scrollWidth
      fits = width <= box!.clientWidth
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  })
</script>

<span class="marquee" class:moving={!fits} bind:this={box}>
  <span class="track" style:--lap="{(width + GAP) / SPEED}s" style:--gap="{GAP}px">
    <span bind:this={first}>{text}</span>
    {#if !fits}<span aria-hidden="true">{text}</span>{/if}
  </span>
</span>

<style>
  .marquee {
    display: block;
    overflow: hidden;
    white-space: nowrap;
  }
  /* At rest: one line, cut with an ellipsis. */
  .track > span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .track > span + span {
    display: none;
  }
  /* Hovered: the whole text twice in a row, moving. */
  :global([data-marquee-host]:hover) .moving .track,
  :global([data-marquee-host]:focus-visible) .moving .track {
    display: inline-flex;
    width: max-content;
    animation: scroll var(--lap) linear infinite;
  }
  :global([data-marquee-host]:hover) .moving .track > span,
  :global([data-marquee-host]:focus-visible) .moving .track > span {
    display: inline-block;
    overflow: visible;
    padding-right: var(--gap);
  }
  /* Moving by half brings the copy where the original was. */
  @keyframes scroll {
    to {
      translate: -50% 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global([data-marquee-host]:hover) .moving .track,
    :global([data-marquee-host]:focus-visible) .moving .track {
      animation: none;
    }
  }
</style>
