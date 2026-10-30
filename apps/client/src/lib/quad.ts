/** [x, y] point in pixels. */
export type Point = readonly [number, number]

/**
 * `matrix3d` that maps a w×h element (origin at the top-left corner) onto the given quad
 * (corners clockwise from the top left). It is Heckbert's square→quad homography, scaled
 * to the element size.
 */
export function quadToMatrix3d(
  w: number,
  h: number,
  quad: readonly [Point, Point, Point, Point],
): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const dy3 = y0 - y1 + y2 - y3
  const det = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / det
  const k = (dx1 * dy3 - dx3 * dy1) / det
  const a = x1 - x0 + g * x1
  const b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1
  const e = y3 - y0 + k * y3
  // matrix3d columns: the element's (u, v) scaled to 0..1.
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1]
  return `matrix3d(${m.map((n) => +n.toFixed(6)).join(',')})`
}

/** Applies the same homography to an element point; used to test the math. */
export function applyMatrix3d(matrix: string, x: number, y: number): Point {
  const m = matrix.slice(9, -1).split(',').map(Number)
  const X = m[0]! * x + m[4]! * y + m[12]!
  const Y = m[1]! * x + m[5]! * y + m[13]!
  const W = m[3]! * x + m[7]! * y + m[15]!
  return [X / W, Y / W]
}
