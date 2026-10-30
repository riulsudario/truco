<script lang="ts">
  import { JUKEBOX_TRACKS } from '@truco/protocol'
  import { onMount } from 'svelte'
  import { music } from '../lib/music.svelte'
  import type { GameSession } from '../lib/session.svelte'
  import { loadYouTube, type YouTubePlayer } from '../lib/youtube'

  /**
   * Player do YouTube da jukebox. Fica visível enquanto toca (é o que pedem os termos do
   * YouTube); na mesa, dentro da TV do bar. Sem música, some e a TV volta ao desenho.
   */
  interface Props {
    session: GameSession
    width: number
    height: number
  }

  let { session, width, height }: Props = $props()

  let host = $state<HTMLElement>()
  let player: YouTubePlayer | null = null
  let ready = $state(false)
  const playing = $derived(!!session.jukebox.trackId)

  onMount(() => {
    let disposed = false
    void loadYouTube().then((YT) => {
      if (disposed || !host) return
      player = new YT.Player(host, {
        width,
        height,
        playerVars: { controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => (ready = true),
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.ENDED) finished()
          },
          // Vídeo que não deixa tocar embutido: pula para a próxima.
          onError: () => finished(),
        },
      })
    })
    return () => {
      disposed = true
      player?.destroy()
    }
  })

  function finished() {
    const id = session.jukebox.trackId
    if (id) session.trackEnded(id)
  }

  // Toca a faixa da sala a partir do ponto em que ela está para todo mundo.
  $effect(() => {
    const { trackId, startedAt } = session.jukebox
    if (!ready || !player) return
    const track = JUKEBOX_TRACKS.find((item) => item.id === trackId)
    if (!track || startedAt === null) {
      player.stopVideo()
      return
    }
    player.loadVideoById({
      videoId: track.youtube,
      startSeconds: Math.max(0, (Date.now() - startedAt) / 1000),
    })
  })

  $effect(() => {
    if (ready) player?.setVolume(music.volume)
  })
</script>

<div class="tv" class:off={!playing} style:width="{width}px" style:height="{height}px">
  <div bind:this={host}></div>
</div>

<style>
  .tv {
    background: #000;
    pointer-events: none;
  }
  .tv :global(iframe) {
    display: block;
  }
  .off {
    visibility: hidden;
  }
</style>
