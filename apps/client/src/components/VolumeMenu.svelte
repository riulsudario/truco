<script lang="ts">
  import { music } from '../lib/music.svelte'
  import { sound } from '../lib/sound.svelte'
  import { t } from '../lib/strings'

  interface Channel {
    label: string
    max: number
    get: () => number
    set: (value: number) => void
  }

  const CHANNELS: Channel[] = [
    {
      label: t.volume.music,
      max: 100,
      get: () => music.volume,
      set: (value) => music.setVolume(value),
    },
    {
      label: t.volume.effects,
      max: 1,
      get: () => sound.volume,
      set: (value) => sound.setVolume(value),
    },
    {
      label: t.volume.voices,
      max: 1,
      get: () => sound.voiceVolume,
      set: (value) => sound.setVoiceVolume(value),
    },
  ]

  let open = $state(false)
  /** Volume before muting, per channel, so unmuting brings it back. */
  const before: Record<string, number> = {}

  function toggleMute(channel: Channel) {
    const value = channel.get()
    if (value > 0) {
      before[channel.label] = value
      channel.set(0)
    } else {
      channel.set(before[channel.label] || channel.max / 2)
    }
  }
</script>

<div class="volume">
  <button class="btn toggle" class:on={open} aria-expanded={open} onclick={() => (open = !open)}>
    🔊 {t.volume.title}
  </button>
  {#if open}
    <div class="menu">
      {#each CHANNELS as channel (channel.label)}
        {@const muted = channel.get() === 0}
        <label for="volume-{channel.label}">{channel.label}</label>
        <input
          id="volume-{channel.label}"
          type="range"
          min="0"
          max={channel.max}
          step={channel.max / 20}
          value={channel.get()}
          oninput={(e) => channel.set(Number(e.currentTarget.value))}
        />
        <button
          class="mute"
          class:muted
          aria-label={muted ? t.volume.unmute(channel.label) : t.volume.mute(channel.label)}
          aria-pressed={muted}
          onclick={() => toggleMute(channel)}>{muted ? '🔇' : '🔊'}</button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .volume {
    position: relative;
  }
  .toggle.on {
    background: var(--gold);
  }
  .menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    z-index: 20;
    width: 260px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px 10px;
    background: var(--paper);
    color: var(--ink);
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 rgb(0 0 0 / 0.5);
    padding: 12px 14px;
    font-size: 15px;
  }
  input {
    width: 100%;
    accent-color: var(--ink);
  }
  .mute {
    font-size: 14px;
    background: none;
    border: 0;
    padding: 2px;
    cursor: pointer;
  }
  .mute.muted {
    opacity: 0.6;
  }
</style>
