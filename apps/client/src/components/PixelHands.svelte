<script lang="ts">
  /**
   * Two pixel-art hands holding the base of the fan, in the avatar's skin tone. Each hand
   * is a closed fist with the thumb over the cards.
   */
  interface Props {
    tones: { outline: string; shadow: string; base: string; light: string }
    /** Size of each pixel, in scene pixels. */
    scale: number
    /** Distance between the two hands, in avatar pixels. */
    gap?: number
    /** In profile only one hand shows, the one on the viewer's side. */
    single?: boolean
  }

  let { tones, scale, gap = 3, single = false }: Props = $props()

  // o outline, b base, l light, s shadow; the thumb (l) sits on top, over the cards.
  const LEFT = ['.oo..', 'ollo.', 'obbbo', 'obbso', '.ooo.']
  const RIGHT = LEFT.map((row) => [...row].reverse().join(''))

  const rows = $derived(single ? LEFT : LEFT.map((row, y) => row + '.'.repeat(gap) + RIGHT[y]))
  const columns = $derived(rows[0]!.length)
  const color = $derived({ o: tones.outline, b: tones.base, l: tones.light, s: tones.shadow })
</script>

<svg
  class="hands"
  viewBox="0 0 {columns} {LEFT.length}"
  width={columns * scale}
  height={LEFT.length * scale}
  shape-rendering="crispEdges"
  aria-hidden="true"
>
  {#each rows as row, y (y)}
    {#each [...row] as cell, x (x)}
      {#if cell !== '.'}
        <rect {x} {y} width="1" height="1" fill={color[cell as 'o' | 'b' | 'l' | 's']} />
      {/if}
    {/each}
  {/each}
</svg>

<style>
  .hands {
    display: block;
  }
</style>
