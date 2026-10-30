<script lang="ts">
  import { JUKEBOX_TRACKS, VOICES, type TrackId, type VoiceId } from '@truco/protocol'
  import { music } from '../lib/music.svelte'
  import type { GameSession } from '../lib/session.svelte'
  import { sound } from '../lib/sound.svelte'
  import { t } from '../lib/strings'
  import JukeboxTV from './JukeboxTV.svelte'

  interface Props {
    session: GameSession
    /** Where there is no bar TV (waiting room), the panel shows its own player. */
    withTv?: boolean
  }

  let { session, withTv = false }: Props = $props()

  let open = $state(false)
  const VOICE_IDS = Object.keys(VOICES) as VoiceId[]
  const current = $derived(JUKEBOX_TRACKS.find((track) => track.id === session.jukebox.trackId))

  function choose(id: TrackId | null) {
    session.chooseTrack(id)
  }

  function next() {
    const id = session.jukebox.trackId
    if (id) session.trackEnded(id)
  }
</script>

<aside class="jukebox" class:playing={!!current}>
  <header>
    <button class="toggle" onclick={() => (open = !open)} aria-expanded={open}>
      🎵 {current ? `${current.title}` : t.jukebox.title}
    </button>
  </header>

  {#if withTv}
    <!-- Without the bar TV the player lives here, visible (200×200) while playing. -->
    <div class="own-tv" class:hidden={!current}>
      <JukeboxTV {session} width={200} height={200} />
    </div>
  {/if}

  {#if open}
    <div class="panel">
      {#if current}
        <p class="now">{current.artist}</p>
        <div class="row">
          <button class="mini" onclick={() => choose(null)}>⏹ {t.jukebox.stop}</button>
          <button class="mini" onclick={next}>⏭ {t.jukebox.next}</button>
        </div>
      {/if}
      <ol class="tracks">
        {#each JUKEBOX_TRACKS as track (track.id)}
          <li>
            <button class:on={track.id === current?.id} onclick={() => choose(track.id)}>
              <b>{track.title}</b> <span>{track.artist}</span>
            </button>
          </li>
        {/each}
      </ol>
      <label class="slider">
        {t.jukebox.music}
        <input
          type="range"
          min="0"
          max="100"
          value={music.volume}
          oninput={(e) => music.setVolume(Number(e.currentTarget.value))}
        />
      </label>
      <label class="slider">
        {t.jukebox.effects}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={sound.volume}
          oninput={(e) => sound.setVolume(Number(e.currentTarget.value))}
        />
      </label>
      <label class="slider">
        {t.jukebox.voices}
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={sound.voiceVolume}
          oninput={(e) => sound.setVoiceVolume(Number(e.currentTarget.value))}
        />
      </label>
      <fieldset class="voices">
        <legend>{t.jukebox.mutedVoices}</legend>
        {#each VOICE_IDS as id (id)}
          <label>
            <input
              type="checkbox"
              checked={!sound.mutedVoices.includes(id)}
              onchange={() => sound.toggleVoice(id)}
            />{VOICES[id].label}
          </label>
        {/each}
      </fieldset>
      {#if session.sharedJukebox}<p class="hint">{t.jukebox.shared}</p>{/if}
    </div>
  {/if}
</aside>

<style>
  .jukebox {
    position: fixed;
    left: 16px;
    top: 200px;
    z-index: 20;
    width: 220px;
    background: rgb(0 0 0 / 0.65);
    border: 3px solid var(--ink);
    box-shadow: 3px 3px 0 var(--ink);
    padding: 6px;
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .toggle {
    width: 100%;
    font: inherit;
    text-align: left;
    color: var(--gold);
    background: none;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .own-tv {
    width: 206px;
    margin: 0 auto;
    border: 3px solid var(--ink);
  }
  /* With no music the player sits off screen but mounted (the API needs the element). */
  .own-tv.hidden {
    position: absolute;
    left: -9999px;
  }
  .panel {
    display: grid;
    gap: 6px;
  }
  .now {
    margin: 0;
    opacity: 0.8;
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .mini {
    font: inherit;
    font-size: 12px;
    padding: 2px 6px;
    border: 2px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .tracks {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
    display: grid;
    gap: 2px;
  }
  .tracks button {
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 13px;
    color: var(--paper);
    background: var(--panel);
    border: 2px solid var(--ink);
    padding: 3px 6px;
    cursor: pointer;
  }
  .tracks button.on {
    background: var(--gold);
    color: var(--ink);
  }
  .tracks span {
    display: block;
    font-size: 11px;
    opacity: 0.75;
  }
  .slider {
    display: grid;
    gap: 2px;
    font-size: 12px;
  }
  .voices {
    margin: 0;
    padding: 2px 4px;
    border: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    font-size: 12px;
  }
  .voices legend {
    padding: 0;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    opacity: 0.7;
  }
  /* Phone in portrait: bottom corner, over the table. */
  @media (max-aspect-ratio: 5/4), (max-width: 759px) {
    .jukebox {
      top: auto;
      left: auto;
      right: 8px;
      bottom: 72px;
    }
  }
</style>
