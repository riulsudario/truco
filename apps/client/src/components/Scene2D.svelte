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
    /** O que passa na TV da parede (a jukebox); recebe a largura e a altura da tela. */
    tv?: Snippet<[{ width: number; height: number }]>
  }

  let { hand, me, round, names, avatars, shouts, acting, banner, events, tv }: Props = $props()

  /**
   * A mesa vista da sua cadeira, em camadas: o bar (imagem inteira), os bonecos de pixel
   * art (montados no navegador com o visual de cada um), a frente da mesa por cima
   * escondendo o colo e as cartas jogadas deitadas no feltro. Tudo em pixels da imagem.
   */
  const POSITIONS = ['near', 'right', 'far', 'left'] as const
  const SEATED: Seated[] = ['left', 'far', 'right']
  /** Onde fica o colo dentro do quadro 64×64 do boneco sentado. */
  const LAP = { x: 32, y: 44 }
  /**
   * Centro do leque dentro do quadro do boneco, conforme a direção: de frente, na altura
   * das mãos; de perfil, mais à frente do rosto e mais alto, já em direção ao centro da
   * mesa (mais longe de você).
   */
  const HELD_AT = {
    front: { x: 32, y: 40 },
    right: { x: 40, y: 39 },
    left: { x: 24, y: 39 },
  } as const
  /** Do colo ao topo da cabeça, em pixels do quadro. */
  const SEATED_PX = 32
  const SIZE = SCENE_SIZE
  /** Tamanho em que o player é criado antes de ser encaixado na TV (16:9 aproximado). */
  const TV = { w: 160, h: 116 }

  const seatOf = (position: (typeof POSITIONS)[number]) =>
    ((me + POSITIONS.indexOf(position)) % 4) as Seat
  const positionOf = (seat: Seat) => POSITIONS[(seat - me + 4) % 4]!

  /** Canto do boneco de cada cadeira, a partir do colo mapeado na imagem. */
  function place(position: Seated) {
    const { lap, scale } = SEATS[position]
    return {
      scale,
      x: lap[0] - LAP.x * scale,
      y: lap[1] - LAP.y * scale,
      head: [lap[0], lap[1] - (SEATED_PX - 2) * scale] as Point,
    }
  }

  // ---- encaixe da cena na tela ------------------------------------------------------------
  let element = $state<HTMLElement>()
  let fit = $state({ scale: 1, x: 0, y: 0, w: SIZE.w as number, h: SIZE.h as number })
  /**
   * Zoom numa tela estreita (corta um pouco as laterais em vez de sobrar tarja). Pouco:
   * quem senta nas pontas está na borda da imagem.
   */
  const NARROW_ZOOM = 1.08

  $effect(() => {
    if (!element) return
    const observer = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = element!
      // Tela larga: a cena cobre tudo. Estreita: aparece inteira (com um pouco de zoom).
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

  /** Etiqueta do nome em cima da cabeça, sempre dentro da tela. */
  function tagPosition(head: Point) {
    const margin = 90
    return {
      left: Math.min(fit.w - margin, Math.max(margin, fit.x + head[0] * fit.scale)),
      top: Math.max(56, fit.y + head[1] * fit.scale),
    }
  }

  // ---- gestos -----------------------------------------------------------------------------
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

  // ---- cartas -----------------------------------------------------------------------------
  // Cache das imagens das cartas; não precisa ser reativo.
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
    <img class="layer" src="/scene/bar-fundo.webp" alt="" />
    {#if tv}
      <!-- Clipe da jukebox encaixado na tela da TV, com a mesma perspectiva do desenho. -->
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
        <!-- Leque nas mãos, na altura do peito; nas pontas, virado para o centro da mesa. -->
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
            <!-- Mãos fechadas na base do leque, por cima das cartas. -->
            <div class="grip">
              <PixelHands tones={skinTones(avatar)} scale={at.scale} single={position !== 'far'} />
            </div>
          {/if}
        </div>
      </div>
    {/each}

    <img class="layer" src="/scene/bar-frente.webp" alt="" />

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
      {#if shouts[seat]}<span class="shout"><ShoutText text={shouts[seat]} /></span>{/if}
      <span class="name">{names[seat]}</span>
    </div>
  {/each}

  {#if banner}<div class="banner">{banner}</div>{/if}
  {#if shouts[me]}<span class="shout mine"><ShoutText text={shouts[me]} /></span>{/if}
  {#if shouts[AUDIENCE]}<span class="shout audience"><ShoutText text={shouts[AUDIENCE]} /></span
    >{/if}
</section>

<style>
  /* Em pé, a caixa tem a proporção do recorte com zoom (largura / NARROW_ZOOM): sem tarja. */
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
  /* Ampliação sem filtro: é isso que mantém a cara de pixel art. */
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
  /* As mãos ficam na base do leque, um pouco abaixo, centralizadas. */
  .grip {
    position: absolute;
    left: 50%;
    bottom: 0;
    translate: -50% 55%;
  }
  /* Mesmo leque da sua mão: cartas sobrepostas, girando em volta de um ponto abaixo. */
  .held img {
    transform-origin: 50% 140%;
  }
  /*
   * Quem senta de lado segura o leque virado para o centro da mesa: daqui vemos o verso
   * de quina. Encurtamento chapado, como em pixel art: estreita na horizontal e sobe um
   * pouco do lado que está mais longe (o do centro da mesa).
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

  /* Gestos em passos secos, no ritmo da pixel art. */
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
    /* Falas gravadas são frases inteiras: quebram linha em vez de vazar da tela. */
    width: max-content;
    max-width: 280px;
    text-align: center;
    animation: pop 160ms steps(3);
  }
  /* Rabicho do balão apontando para quem falou. */
  .shout::after {
    content: '';
    position: absolute;
    top: 100%;
    left: calc(50% - 5px);
    border: 5px solid transparent;
    border-top-color: var(--ink);
  }
  .shout.mine,
  .shout.audience {
    position: absolute;
    left: 50%;
    translate: -50% 0;
    z-index: 5;
  }
  /* Seu balão fica acima da sua mão, que na tela deitada cobre a parte de baixo da cena. */
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

  /* Tela deitada: a mesa ocupa a tela inteira, atrás do HUD. */
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
