<script lang="ts">
  import { JUKEBOX_TRACKS, nextTrack, previousTrack, type TrackId } from '@truco/protocol'
  import type { GameSession } from '../lib/session.svelte'
  import { t } from '../lib/strings'
  import JukeboxTV from './JukeboxTV.svelte'
  import Marquee from './Marquee.svelte'

  interface Props {
    session: GameSession
    /** Where there is no bar TV (waiting room), the panel shows its own player. */
    withTv?: boolean
  }

  let { session, withTv = false }: Props = $props()

  let open = $state(false)
  /** Last track played, so play after a pause picks it up again. */
  let last = $state<TrackId | null>(null)
  const current = $derived(JUKEBOX_TRACKS.find((track) => track.id === session.jukebox.trackId))

  $effect(() => {
    if (current) last = current.id
  })

  function cover(youtube: string): string {
    return `https://i.ytimg.com/vi/${youtube}/mqdefault.jpg`
  }

  function choose(id: TrackId | null) {
    session.chooseTrack(id)
  }

  // The music is the room's: pausing stops it for everyone and play starts the track over.
  function toggle() {
    choose(current ? null : (last ?? nextTrack(null)))
  }
</script>

{#snippet controls()}
  <div class="now" data-marquee-host>
    <span class="note" aria-hidden="true">♪</span>
    <div class="what">
      <b><Marquee text={current?.title ?? t.jukebox.silence} /></b>
      {#if current}<span><Marquee text={current.artist} /></span>{/if}
    </div>
    <div class="buttons">
      <button
        class="icon"
        aria-label={t.jukebox.previous}
        onclick={() => choose(previousTrack(current?.id ?? last))}>⏮</button
      >
      <button class="icon" aria-label={current ? t.jukebox.pause : t.jukebox.play} onclick={toggle}
        >{current ? '⏸' : '▶'}</button
      >
      <button
        class="icon"
        aria-label={t.jukebox.next}
        onclick={() => choose(nextTrack(current?.id ?? last))}>⏭</button
      >
    </div>
  </div>
{/snippet}

<aside class="jukebox" class:open>
  {#if open}
    <header>
      <h2>{t.jukebox.title}</h2>
      <button class="icon close" aria-label={t.jukebox.close} onclick={() => (open = false)}
        >✕</button
      >
    </header>
    <ol class="tracks">
      {#each JUKEBOX_TRACKS as track (track.id)}
        <li>
          <button
            class:on={track.id === current?.id}
            aria-pressed={track.id === current?.id}
            aria-label="{track.title}, {track.artist}"
            data-marquee-host
            onclick={() => choose(track.id)}
          >
            <img src={cover(track.youtube)} alt="" loading="lazy" />
            <span class="title"><Marquee text={track.title} /></span>
          </button>
        </li>
      {/each}
    </ol>
    {@render controls()}
    {#if session.sharedJukebox}<p class="hint">{t.jukebox.shared}</p>{/if}
  {:else if current}
    <div class="mini" data-marquee-host>
      <button class="opener" aria-label={t.jukebox.open} onclick={() => (open = true)}></button>
      {@render controls()}
    </div>
  {:else}
    <button class="btn closed" onclick={() => (open = true)}>♪ {t.jukebox.title}</button>
  {/if}

  {#if withTv}
    <!-- Without the bar TV the player lives here, visible (200×200) while playing. -->
    <div class="own-tv" class:hidden={!current}>
      <JukeboxTV {session} width={200} height={200} />
    </div>
  {/if}
</aside>

<style>
  .jukebox {
    position: fixed;
    left: 16px;
    top: 16px;
    z-index: 20;
    display: grid;
    gap: 8px;
    font-size: 14px;
  }
  .jukebox.open,
  .mini {
    width: 320px;
    background: rgb(26 20 35 / 0.92);
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 rgb(0 0 0 / 0.5);
  }
  .jukebox.open {
    padding: 10px;
  }
  .closed {
    font-size: 15px;
    padding: 10px 16px;
    text-transform: uppercase;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-family: var(--display);
    font-size: 13px;
    font-weight: 400;
    color: var(--gold);
  }
  .tracks {
    list-style: none;
    margin: 0;
    padding: 0 4px 0 0;
    max-height: 270px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .tracks button {
    width: 100%;
    display: grid;
    gap: 4px;
    font: inherit;
    font-size: 12px;
    color: var(--paper);
    background: var(--panel);
    border: 2px solid var(--ink);
    padding: 4px;
    cursor: pointer;
  }
  .tracks img {
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
    display: block;
    background: var(--ink);
  }
  .title {
    min-width: 0;
    text-align: center;
  }
  .tracks button:hover {
    border-color: var(--paper);
  }
  .tracks button.on {
    background: var(--gold);
    color: var(--ink);
    border-color: var(--gold);
  }
  .mini {
    position: relative;
  }
  /* The whole mini player opens the panel, except its buttons, which sit above. */
  .opener {
    position: absolute;
    inset: 0;
    background: none;
    border: 0;
    cursor: pointer;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    background: var(--panel);
    border: 2px solid var(--ink);
  }
  .mini .now {
    border: 0;
    background: none;
  }
  .note {
    font-size: 22px;
    color: var(--gold);
  }
  .what {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .what b,
  .what span {
    min-width: 0;
  }
  .what b {
    font-weight: 400;
  }
  .what span {
    font-size: 12px;
    opacity: 0.7;
  }
  .buttons {
    position: relative;
    display: flex;
    gap: 2px;
  }
  .icon {
    font: inherit;
    font-size: 16px;
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    color: var(--paper);
    background: none;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .icon:hover,
  .icon:focus-visible {
    border-color: var(--paper);
  }
  .hint {
    margin: 0;
    font-size: 12px;
    text-align: center;
    opacity: 0.7;
  }
  .own-tv {
    width: 206px;
    border: 3px solid var(--ink);
  }
  /* With no music the player sits off screen but mounted (the API needs the element). */
  .own-tv.hidden {
    position: absolute;
    left: -9999px;
  }
  /* Phone in portrait: bottom corner, over the table. */
  @media (max-aspect-ratio: 5/4), (max-width: 759px) {
    .jukebox {
      top: auto;
      left: auto;
      right: 8px;
      bottom: 8px;
      justify-items: end;
    }
    .jukebox.open,
    .mini {
      width: min(320px, calc(100vw - 16px));
    }
  }
</style>
