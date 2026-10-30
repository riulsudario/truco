<script lang="ts">
  import type { Avatar } from '@truco/protocol'
  import { renderAvatar, type Facing } from '../lib/avatar-render'

  interface Props {
    avatar: Avatar
    facing?: Facing
    /** Tamanho de cada pixel do boneco (64×64) em px CSS. */
    scale?: number
  }

  let { avatar, facing = 'front', scale = 3 }: Props = $props()
  let canvas = $state<HTMLCanvasElement>()

  $effect(() => {
    const target = canvas
    if (!target) return
    let current = true
    void renderAvatar(avatar, facing).then((sprite) => {
      if (!current) return
      const ctx = target.getContext('2d')!
      ctx.clearRect(0, 0, 64, 64)
      ctx.drawImage(sprite, 0, 0)
    })
    return () => (current = false)
  })
</script>

<canvas
  bind:this={canvas}
  width="64"
  height="64"
  style:width="{64 * scale}px"
  style:height="{64 * scale}px"
></canvas>

<style>
  canvas {
    display: block;
    image-rendering: pixelated;
  }
</style>
