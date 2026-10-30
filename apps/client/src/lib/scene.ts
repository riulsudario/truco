import type { Facing } from './avatar-render'
import { applyMatrix3d, quadToMatrix3d, type Point } from './quad'

/**
 * Geometry of the bar image (public/scene/bar-*.webp), in image pixels. Mapped by hand
 * over the drawing: chairs, felt and where each player drops a card.
 */
export type Seated = 'far' | 'left' | 'right'
export type TablePosition = 'near' | Seated
export type Quad = [Point, Point, Point, Point]

export const SCENE_SIZE = { w: 1670, h: 941 } as const

export interface SeatSpot {
  /** Lap of whoever sits there, at the table edge: the front layer hides everything below. */
  lap: Point
  /** Size of each avatar pixel (64×64), in image pixels. */
  scale: number
  facing: Facing
}

export const SEATS: Record<Seated, SeatSpot> = {
  // Back chair, backrest between x 710 and 970: the partner, facing you.
  // Scales close to the illustration's pixel (~7 px), so the avatars match the scenery.
  far: { lap: [839, 535], scale: 8.5, facing: 'front' },
  // End chairs, side-on, facing the center of the table.
  left: { lap: [100, 700], scale: 10, facing: 'right' },
  right: { lap: [1580, 700], scale: 10, facing: 'left' },
}

/** Felt corners (clockwise from the back left). */
export const FELT: Quad = [
  [451, 580],
  [1227, 580],
  [1470, 868],
  [175, 868],
]

/**
 * Played card per position, in felt coordinates (0 to 1 from left to right and from back
 * to front), slightly askew to look like a human hand.
 */
const PLAYED_SPOTS: Record<TablePosition, { u: number; v: number; turn: number }> = {
  near: { u: 0.5, v: 0.52, turn: -0.06 },
  far: { u: 0.5, v: 0.16, turn: 0.05 },
  left: { u: 0.3, v: 0.45, turn: 1.5 },
  right: { u: 0.7, v: 0.45, turn: -1.52 },
}
/** Felt and card sizes in meters: the rotation happens here, without distortion. */
const FELT_METERS = { w: 1.4, d: 0.9 }
const CARD_METERS = { w: 0.13, h: 0.19 }

const feltMatrix = quadToMatrix3d(1, 1, FELT)
const onFelt = (u: number, v: number): Point => applyMatrix3d(feltMatrix, u, v)

function cardQuad({ u, v, turn }: { u: number; v: number; turn: number }): Quad {
  const cos = Math.cos(turn)
  const sin = Math.sin(turn)
  const corner = (dx: number, dy: number): Point => {
    // Card corner in meters, rotated around the center, then back onto the felt (0 to 1).
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

/** TV screen on the bar wall: the jukebox plays the clip here. */
// A bit larger than the drawn screen, so the clip covers the football up to the frame.
export const TV_SCREEN: Quad = [
  [1087, 139],
  [1196, 127],
  [1197, 212],
  [1087, 218],
]
