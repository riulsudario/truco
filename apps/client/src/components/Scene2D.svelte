<script lang="ts">
  import type { Card as CardData, GameEvent, PlayerView, RoundView, Seat } from '@truco/engine'
  import type { Avatar } from '@truco/protocol'
  import { avatarFor } from '../lib/avatars'
  import { CARD_ART, cardBackArt, cardFaceArt } from '../lib/card-art'
  import { quadToMatrix3d, type Point } from '../lib/quad'
  import { PLAYED, SCENE_SIZE, SEATS, TV_SCREEN, type Seated } from '../lib/scene'
  import type { Snippet } from 'svelte'
  import { AUDIENCE } from '../lib/session.svelte'
  import { skinTones } from '../lib/avatar-render'
  import AvatarSprite from './AvatarSprite.svelte'
  import PixelHands from './PixelHands.svelte'
  import ShoutText from './ShoutText.svelte'

  interface Props {
    hand: PlayerView['hand']
    me: Seat
    round: RoundView | null
    names: string[]
    avatars: (Avatar | null)[]
    shouts: Record<number, string>
    acting: Seat[]
    banner: string | null
    events: GameEvent[]
    /** What plays on the wall TV (the jukebox); receives the screen's width and height. */
    tv?: Snippet<[{ width: number; height: number }]>
  }

  let { hand, me, round, names, avatars, shouts, acting, banner, events, tv }: Props = $props()

  /**
   * The table seen from your seat, in layers: the bar (whole image), the pixel-art avatars
   * (assembled in the browser with each one's look), the front of the table on top hiding
   * the laps, and the played cards lying on the felt. Everything in image pixels.
   */
  const POSITIONS = ['near', 'right', 'far', 'left'] as const
  const SEATED: Seated[] = ['left', 'far', 'right']
  /** Where the lap is inside the seated avatar's 64×64 frame. */
  const LAP = { x: 32, y: 44 }
  /**
   * Center of the fan inside the avatar's frame, by facing: from the front, at hand height;
   * in profile, further ahead of the face and higher, already toward the center of the
   * table (further from you).
   */
  const HELD_AT = {
    front: { x: 32, y: 40 },
    right: { x: 40, y: 39 },
    left: { x: 24, y: 39 },
  } as const
  /** From the lap to the top of the head, in frame pixels. */
  const SEATED_PX = 32
  const SIZE = SCENE_SIZE
  /** Size the player is created at before being fitted into the TV (roughly 16:9). */
  const TV = { w: 160, h: 116 }

  const seatOf = (position: (typeof POSITIONS)[number]) =>
    ((me + POSITIONS.indexOf(position)) % 4) as Seat
  const positionOf = (seat: Seat) => POSITIONS[(seat - me + 4) % 4]!

  /** Corner of each seat's avatar, from the lap mapped on the image. */
  function place(position: Seated) {
    const { lap, scale } = SEATS[position]
    return {
      scale,
      x: lap[0] - LAP.x * scale,
      y: lap[1] - LAP.y * scale,
      head: [lap[0], lap[1] - (SEATED_PX - 2) * scale] as Point,
    }
  }

  // ---- fitting the scene to the screen ---------------------------------------------------
  let element = $state<HTMLElement>()
  let fit = $state({ scale: 1, x: 0, y: 0, w: SIZE.w as number, h: SIZE.h as number })
  /**
   * Zoom on a narrow screen (crops the sides a little instead of leaving bars). Just a bit:
   * whoever sits at the ends is at the edge of the image.
   */
  const NARROW_ZOOM = 1.08

  $effect(() => {
    if (!element) return
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = element!
      // Wide screen: the scene covers everything. Narrow: it shows whole (slightly zoomed).
      const cover = w >= 760 && w / h >= 1.25
      const scale = cover
        ? Math.max(w / SIZE.w, h / SIZE.h)
        : Math.min(h / SIZE.h, (w / SIZE.w) * NARROW_ZOOM)
      fit = {
        scale,
        x: (w - SIZE.w * scale) / 2,
        y: cover ? h - SIZE.h * scale : (h - SIZE.h * scale) / 2,
        w,
        h,
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  })

  /** Name tag above the head, always inside the screen. */
  function tagPosition(head: Point) {
    const margin = 90
    return {
      left: Math.min(fit.w - margin, Math.max(margin, fit.x + head[0] * fit.scale)),
      top: Math.max(56, fit.y + head[1] * fit.scale),
    }
  }

  // ---- gestures ---------------------------------------------------------------------------
  let gestures = $state<Partial<Record<Seated, 'play' | 'yes' | 'no'>>>({})
  const GESTURE_MS = 520

  function gesture(position: Seated, kind: 'play' | 'yes' | 'no') {
    gestures[position] = kind
    setTimeout(() => {
      if (gestures[position] === kind) delete gestures[position]
    }, GESTURE_MS)
  }

  $effect(() => {
    for (const event of events) {
      if (!('seat' in event)) continue
      const position = positionOf(event.seat)
      if (position === 'near') continue
      if (event.type === 'cardPlayed') gesture(position, 'play')
      else if (event.type === 'trucoCalled' || event.type === 'trucoAccepted')
        gesture(position, 'yes')
      else if (event.type === 'ran') gesture(position, 'no')
    }
  })

  // ---- cards ------------------------------------------------------------------------------
  // Card image cache; it doesn't need to be reactive.
  const art: Record<string, string> = {}
  function cardImage(card: CardData | null): string {
    const key = card ? `${card.rank}-${card.suit}` : 'back'
    art[key] ??= (card ? cardFaceArt(card) : cardBackArt()).toDataURL()
    return art[key]
  }
</script>

<section class="scene" bind:this={element} style:--ratio="{SIZE.w / NARROW_ZOOM} / {SIZE.h}">
  <div
    class="stage"
    style:width="{SIZE.w}px"
    style:height="{SIZE.h}px"
    style:transform="translate({fit.x}px, {fit.y}px) scale({fit.scale})"
  >
    <img class="layer" src="/scene/bar-back.webp" alt="" />
    {#if tv}
      <!-- Jukebox clip fitted into the TV screen, with the same perspective as the drawing. -->
      <div class="tv-screen" style:transform={quadToMatrix3d(TV.w, TV.h, TV_SCREEN)}>
        {@render tv({ width: TV.w, height: TV.h })}
      </div>
    {/if}

    {#each SEATED as position (position)}
      {@const seat = seatOf(position)}
      {@const at = place(position)}
      {@const count = hand.cardCounts[seat] ?? 0}
      {@const avatar = avatarFor(names[seat] ?? '', avatars[seat])}
      <div
        class="person {gestures[position] ?? ''}"
        class:acting={acting.includes(seat)}
        style:left="{at.x}px"
        style:top="{at.y}px"
      >
        <AvatarSprite {avatar} facing={SEATS[position].facing} scale={at.scale} />
        <!-- Fan in hand, at chest height; at the ends, turned toward the center of the table. -->
        <div
          class="held {SEATS[position].facing}"
          style:left="{HELD_AT[SEATS[position].facing].x * at.scale}px"
          style:top="{HELD_AT[SEATS[position].facing].y * at.scale}px"
        >
          {#each { length: count } as _, i (i)}
            <img
              src={cardImage(null)}
              alt=""
              style:width="{5 * at.scale}px"
              style:margin-left={i ? `${-3 * at.scale}px` : null}
              style:rotate="{(i - (count - 1) / 2) * 10}deg"
            />
          {/each}
          {#if count > 0}
            <!-- Closed hands at the base of the fan, over the cards. -->
            <div class="grip">
              <PixelHands tones={skinTones(avatar)} scale={at.scale} single={position !== 'far'} />
            </div>
          {/if}
        </div>
      </div>
    {/each}

    <img class="layer" src="/scene/bar-front.webp" alt="" />

    {#each round?.plays ?? [] as play (play.seat)}
      {@const quad = PLAYED[positionOf(play.seat)]}
      <img
        class="played"
        src={cardImage(play.card)}
        alt=""
        style:width="{CARD_ART.w}px"
        style:height="{CARD_ART.h}px"
        style:transform={quadToMatrix3d(CARD_ART.w, CARD_ART.h, quad)}
      />
    {/each}
  </div>

  {#each SEATED as position (position)}
    {@const seat = seatOf(position)}
    {@const tag = tagPosition(place(position).head)}
    <div
      class="tag"
      class:acting={acting.includes(seat)}
      style:left="{tag.left}px"
      style:top="{tag.top}px"
    >
      {#if shouts[seat]}<span class="shout" class:beside={position === 'far'}
          ><ShoutText text={shouts[seat]} /></span
        >{/if}
      <span class="name">{names[seat]}</span>
    </div>
  {/each}

  {#if banner}<div class="banner">{banner}</div>{/if}
  {#if shouts[me]}<span class="shout mine"><ShoutText text={shouts[me]} /></span>{/if}
  {#if shouts[AUDIENCE]}<span class="shout audience"><ShoutText text={shouts[AUDIENCE]} /></span
    >{/if}
</section>

<style>
  /* In portrait the box has the zoomed crop's ratio (width / NARROW_ZOOM): no bars. */
  .scene {
    position: relative;
    align-self: center;
    aspect-ratio: var(--ratio);
    overflow: hidden;
    border: 3px solid var(--ink);
    box-shadow: 4px 4px 0 rgb(0 0 0 / 0.4);
    background: #000;
  }
  .stage {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  /* Unfiltered upscaling: that's what keeps the pixel-art look. */
  .stage,
  .stage * {
    image-rendering: pixelated;
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .person {
    position: absolute;
  }
  .tv-screen {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  .held {
    position: absolute;
    translate: -50% -50%;
    display: flex;
  }
  /* The hands sit at the base of the fan, a little below, centered. */
  .grip {
    position: absolute;
    left: 50%;
    bottom: 0;
    translate: -50% 55%;
  }
  /* Same fan as your hand: overlapping cards rotating around a point below. */
  .held img {
    transform-origin: 50% 140%;
  }
  /*
   * Side players hold the fan turned toward the center of the table: from here we see the
   * backs edge-on. Flat foreshortening, as in pixel art: narrower horizontally and a bit
   * higher on the far side (the one toward the center of the table).
   */
  .held.right {
    transform: scaleX(0.55) skewY(-12deg);
  }
  .held.left {
    transform: scaleX(0.55) skewY(12deg);
  }
  .played {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    animation: drop 140ms steps(3);
  }
  @keyframes drop {
    from {
      opacity: 0;
    }
  }

  /* Gestures in hard steps, in the pixel-art rhythm. */
  .person.acting {
    animation: breathe 0.8s steps(2) infinite;
  }
  @keyframes breathe {
    50% {
      translate: 0 -1px;
    }
  }
  .play {
    animation: hop 0.5s steps(3);
  }
  @keyframes hop {
    40% {
      translate: 0 -4px;
    }
  }
  .yes {
    animation: nod 0.5s steps(2) 2;
  }
  @keyframes nod {
    50% {
      translate: 0 2px;
    }
  }
  .no {
    animation: shake 0.25s steps(2) 2;
  }
  @keyframes shake {
    25% {
      translate: -2px 0;
    }
    75% {
      translate: 2px 0;
    }
  }

  .tag {
    position: absolute;
    translate: -50% -100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    pointer-events: none;
  }
  .name {
    background: var(--ink);
    color: var(--paper);
    padding: 1px 6px;
    font-size: 14px;
    white-space: nowrap;
  }
  .tag.acting .name {
    background: var(--gold);
    color: var(--ink);
  }
  .shout {
    position: relative;
    background: var(--paper);
    color: var(--ink);
    border: 3px solid var(--ink);
    padding: 2px 8px;
    font-size: 16px;
    /* Recorded lines are whole sentences: they wrap instead of overflowing the screen. */
    width: max-content;
    max-width: 280px;
    text-align: center;
    animation: pop 160ms steps(3);
  }
  /* Balloon tail pointing at whoever spoke. */
  .shout::after {
    content: '';
    position: absolute;
    top: 100%;
    left: calc(50% - 5px);
    border: 5px solid transparent;
    border-top-color: var(--ink);
  }
  /*
   * The partner across the table speaks to the side of their head: above it, the balloon would
   * sit under the scoreboard and the truco buttons.
   */
  .shout.beside {
    position: absolute;
    left: calc(50% + 110px);
    top: calc(100% + 210px);
  }
  .shout.beside::after {
    top: 12px;
    left: auto;
    right: 100%;
    border-top-color: transparent;
    border-right-color: var(--ink);
  }
  .shout.mine,
  .shout.audience {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    z-index: 5;
  }
  /* Your balloon sits above your hand, which in landscape covers the bottom of the scene. */
  .shout.mine {
    bottom: 4%;
  }
  @media (min-aspect-ratio: 5/4) and (min-width: 760px) {
    .shout.mine {
      bottom: 30%;
    }
  }
  .shout.audience {
    top: 2%;
    font-size: 14px;
  }
  .shout.mine::after,
  .shout.audience::after {
    display: none;
  }
  @keyframes pop {
    from {
      scale: 0.4;
    }
  }
  .banner {
    position: absolute;
    left: 50%;
    top: 55%;
    translate: -50% -50%;
    background: var(--ink);
    color: var(--gold);
    padding: 6px 12px;
    border: 3px solid var(--gold);
    white-space: nowrap;
    z-index: 4;
  }

  /* Landscape: the table fills the whole screen, behind the HUD. */
  @media (min-aspect-ratio: 5/4) and (min-width: 760px) {
    .scene {
      position: absolute;
      inset: 0;
      align-self: stretch;
      aspect-ratio: auto;
      border: 0;
      box-shadow: none;
    }
  }
</style>
