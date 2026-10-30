<script lang="ts">
  import { JUKEBOX_TRACKS } from '@truco/protocol'
  import { onMount } from 'svelte'
  import { music } from '../lib/music.svelte'
  import { OUTPUT_SCALE } from '../lib/sound.svelte'
  import type { GameSession } from '../lib/session.svelte'
  import { loadYouTube, type YouTubePlayer } from '../lib/youtube'

  /**
   * The jukebox YouTube player. It stays visible while playing (as YouTube's terms require);
   * at the table, inside the bar's TV. With no music it hides and the TV shows the drawing.
   */
  interface Props {
    session: GameSession
    width: number
    height: number
  }

  let { session, width, height }: Props = $props()

  /**
   * The player is built taller than the screen and cropped top and bottom: the video sits in
   * the middle, and YouTube's title bar and share/watch later buttons fall outside.
   */
  const crop = $derived(Math.round(height * 0.4))

  /** YouTube flashes its play icon as a video starts: the screen stays dark until it fades. */
  const REVEAL_DELAY_MS = 1200
  let revealed = $state(false)
  let revealTimer: ReturnType<typeof setTimeout> | undefined

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
        height: height + 2 * crop,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => (ready = true),
          onStateChange: (event: { data: number }) => {
            if (event.data === YT.PlayerState.ENDED) finished()
            if (event.data === YT.PlayerState.PLAYING && !revealed) {
              clearTimeout(revealTimer)
              revealTimer = setTimeout(() => (revealed = true), REVEAL_DELAY_MS)
            }
          },
          // A video that can't be played embedded: skip to the next one.
          onError: () => finished(),
        },
      })
    })
    return () => {
      disposed = true
      clearTimeout(revealTimer)
      player?.destroy()
    }
  })

  function finished() {
    const id = session.jukebox.trackId
    if (id) session.trackEnded(id)
  }

  // Plays the room's track from the point where it is for everyone.
  $effect(() => {
    const { trackId, startedAt } = session.jukebox
    if (!ready || !player) return
    clearTimeout(revealTimer)
    revealed = false
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
    if (ready) player?.setVolume(music.volume * OUTPUT_SCALE)
  })
</script>

<div class="tv" class:off={!playing} style:width="{width}px" style:height="{height}px">
  <div class="crop" style:top="{-crop}px"><div bind:this={host}></div></div>
  <div class="cover" class:gone={revealed}></div>
</div>

<style>
  .tv {
    position: relative;
    overflow: hidden;
    background: #000;
    pointer-events: none;
  }
  .crop {
    position: absolute;
    left: 0;
  }
  .cover {
    position: absolute;
    inset: 0;
    background: #000;
    transition: opacity 300ms;
  }
  .cover.gone {
    opacity: 0;
  }
  .tv :global(iframe) {
    display: block;
  }
  .off {
    visibility: hidden;
  }
</style>
