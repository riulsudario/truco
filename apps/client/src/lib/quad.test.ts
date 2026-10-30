import { describe, expect, it } from 'vitest'
import { applyMatrix3d, quadToMatrix3d, type Point } from './quad'

describe('quadToMatrix3d', () => {
  const near = (a: Point, b: Point) => {
    expect(a[0]).toBeCloseTo(b[0], 2)
    expect(a[1]).toBeCloseTo(b[1], 2)
  }

  it('maps the four element corners to the corners of the perspective quad', () => {
    const quad: [Point, Point, Point, Point] = [
      [120, 80],
      [170, 82],
      [180, 140],
      [110, 136],
    ]
    const matrix = quadToMatrix3d(20, 30, quad)
    near(applyMatrix3d(matrix, 0, 0), quad[0])
    near(applyMatrix3d(matrix, 20, 0), quad[1])
    near(applyMatrix3d(matrix, 20, 30), quad[2])
    near(applyMatrix3d(matrix, 0, 30), quad[3])
  })

  it('a rectangle becomes just translation and scale', () => {
    const matrix = quadToMatrix3d(10, 10, [
      [5, 5],
      [25, 5],
      [25, 25],
      [5, 25],
    ])
    near(applyMatrix3d(matrix, 5, 5), [15, 15])
  })
})
