<script lang="ts">
  import { TAUNTS } from '@truco/protocol'

  interface Props {
    text: string
  }

  let { text }: Props = $props()

  /** Each emoji has its own motion; phrases stay still. */
  const MOTION: Record<string, string> = {
    laugh: 'shake',
    angry: 'tremble',
    cry: 'sob',
    fire: 'flicker',
    heart: 'pulse',
    skull: 'wobble',
    eyes: 'glance',
    clap: 'clap',
  }

  const motion = $derived.by(() => {
    const taunt = TAUNTS.find((x) => x.kind === 'emoji' && x.text === text)
    return taunt ? MOTION[taunt.id] : undefined
  })
</script>

{#if motion}
  <span class="emoji {motion}">{text}</span>
{:else}
  {text}
{/if}

<style>
  .emoji {
    display: inline-block;
    font-size: 28px;
    line-height: 1.1;
  }
  /* Hard steps instead of smooth transitions, to match the pixel art. */
  .shake {
    animation: shake 0.5s steps(4) infinite;
  }
  @keyframes shake {
    0%,
    100% {
      rotate: -10deg;
    }
    50% {
      rotate: 10deg;
      translate: 0 -2px;
    }
  }
  .tremble {
    animation: tremble 0.2s steps(2) infinite;
  }
  @keyframes tremble {
    50% {
      translate: 2px 0;
      scale: 1.08;
    }
  }
  .sob {
    animation: sob 0.7s steps(3) infinite;
  }
  @keyframes sob {
    50% {
      translate: 0 3px;
      scale: 1 0.9;
    }
  }
  .flicker {
    animation: flicker 0.4s steps(3) infinite;
  }
  @keyframes flicker {
    33% {
      scale: 1.05 1.15;
    }
    66% {
      scale: 0.95 1.05;
      rotate: 4deg;
    }
  }
  .pulse {
    animation: pulse 0.6s steps(3) infinite;
  }
  @keyframes pulse {
    40% {
      scale: 1.3;
    }
  }
  .wobble {
    animation: wobble 0.8s steps(4) infinite;
  }
  @keyframes wobble {
    25% {
      rotate: -14deg;
    }
    75% {
      rotate: 14deg;
    }
  }
  .glance {
    animation: glance 1.2s steps(2) infinite;
  }
  @keyframes glance {
    0%,
    100% {
      translate: -4px 0;
    }
    50% {
      translate: 4px 0;
    }
  }
  .clap {
    animation: clap 0.3s steps(2) infinite;
  }
  @keyframes clap {
    50% {
      scale: 0.8 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .emoji {
      animation: none;
    }
  }
</style>
