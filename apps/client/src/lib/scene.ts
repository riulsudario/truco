import type { Facing } from './avatar-render'
import { applyMatrix3d, quadToMatrix3d, type Point } from './quad'

/**
 * Geometria da imagem do bar (public/scene/bar-*.webp), em pixels da imagem. Mapeada à
 * mão sobre o desenho: cadeiras, feltro e onde cada um larga a carta.
 */
export type Seated = 'far' | 'left' | 'right'
export type TablePosition = 'near' | Seated
export type Quad = [Point, Point, Point, Point]

export const SCENE_SIZE = { w: 1670, h: 941 } as const

export interface SeatSpot {
  /** Colo de quem senta ali, na beira da mesa: a camada da frente esconde dali para baixo. */
  lap: Point
  /** Tamanho de cada pixel do boneco (64×64), em pixels da imagem. */
  scale: number
  facing: Facing
}

export const SEATS: Record<Seated, SeatSpot> = {
  // Cadeira do fundo, de encosto entre x 710 e 970: o parceiro, de frente para você.
  // Escalas perto do pixel da ilustração (~7 px), para os bonecos casarem com o cenário.
  far: { lap: [839, 535], scale: 8.5, facing: 'front' },
  // Cadeiras das pontas, de lado, viradas para o centro da mesa.
  left: { lap: [100, 700], scale: 10, facing: 'right' },
  right: { lap: [1580, 700], scale: 10, facing: 'left' },
}

/** Cantos do feltro (sentido horário a partir do fundo à esquerda). */
export const FELT: Quad = [
  [451, 580],
  [1227, 580],
  [1470, 868],
  [175, 868],
]

/**
 * Carta jogada por posição, em coordenadas do feltro (0 a 1 da esquerda para a direita e
 * do fundo para a frente), com uma torta para parecer mão de gente.
 */
const PLAYED_SPOTS: Record<TablePosition, { u: number; v: number; turn: number }> = {
  near: { u: 0.5, v: 0.52, turn: -0.06 },
  far: { u: 0.5, v: 0.16, turn: 0.05 },
  left: { u: 0.3, v: 0.45, turn: 1.5 },
  right: { u: 0.7, v: 0.45, turn: -1.52 },
}
/** Medidas do feltro e da carta em metros: a rotação é feita aqui, sem distorcer. */
const FELT_METERS = { w: 1.4, d: 0.9 }
const CARD_METERS = { w: 0.13, h: 0.19 }

const feltMatrix = quadToMatrix3d(1, 1, FELT)
const onFelt = (u: number, v: number): Point => applyMatrix3d(feltMatrix, u, v)

function cardQuad({ u, v, turn }: { u: number; v: number; turn: number }): Quad {
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const corner = (dx: number, dy: number): Point => {
    // Canto da carta em metros, girado em volta do centro, depois de volta ao feltro (0 a 1).
    const x = ((dx * CARD_METERS.w) / 2) * cos - ((dy * CARD_METERS.h) / 2) * sin
    const y = ((dx * CARD_METERS.w) / 2) * sin + ((dy * CARD_METERS.h) / 2) * cos
    return onFelt(u + x / FELT_METERS.w, v + y / FELT_METERS.d)
  }
  return [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]
}

export const PLAYED: Record<TablePosition, Quad> = {
  near: cardQuad(PLAYED_SPOTS.near),
  far: cardQuad(PLAYED_SPOTS.far),
  left: cardQuad(PLAYED_SPOTS.left),
  right: cardQuad(PLAYED_SPOTS.right),
}

/** Tela da TV na parede do bar: a jukebox passa o clipe aqui. */
// Um pouco maior que a tela desenhada, para o clipe cobrir o futebol até a moldura.
export const TV_SCREEN: Quad = [
  [1087, 139],
  [1196, 127],
  [1197, 212],
  [1087, 218],
]
