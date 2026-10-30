<script lang="ts">
  /**
   * Duas mãos em pixel art segurando a base do leque, na cor da pele do boneco. Cada mão
   * é um punho fechado com o polegar por cima das cartas.
   */
  interface Props {
    tones: { outline: string; shadow: string; base: string; light: string }
    /** Tamanho de cada pixel, em pixels da cena. */
    scale: number
    /** Distância entre as duas mãos, em pixels do boneco. */
    gap?: number
    /** De perfil só aparece uma mão, a do lado de quem olha. */
    single?: boolean
  }

  let { tones, scale, gap = 3, single = false }: Props = $props()

  // o contorno, b base, l luz, s sombra; o polegar (l) fica no alto, por cima das cartas.
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
