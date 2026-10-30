// Scene layers from the bar image (scene-src/bar.png):
// - bar-back.webp: the whole image;
// - bar-front.webp: only the wooden edge, the felt and what's on the table (glasses,
//   bottle, ashtray, peanuts), on a transparent background. The game draws this layer over
//   the avatars, so whoever sits behind the table has their lap hidden.
// Coordinates in image pixels (1670×941). WebP so the scene stays light.
import { mkdir, readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import sharp from 'sharp'

const SOURCE = 'scene-src/bar.png'
const OUT = 'public/scene'
const QUALITY = 88

/** Tabletop and wooden edge, down to the bottom of the image. */
const TABLE = [
  [367, 555],
  [1253, 555],
  [1670, 800],
  [1670, 941],
  [0, 941],
  [0, 800],
]
/** Objects sticking out past the table edge: [x0, y0, x1, y1]. */
const OBJECTS = [
  [745, 530, 828, 622], // back mug, in front of the partner
  [265, 585, 372, 697], // left mug
  [1348, 597, 1455, 710], // right mug
  [40, 664, 142, 900], // bottle
]

function insidePolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const inRect = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1

const image = PNG.sync.read(await readFile(SOURCE))
let kept = 0
for (let y = 0; y < image.height; y++) {
  for (let x = 0; x < image.width; x++) {
    const front = insidePolygon(x, y, TABLE) || OBJECTS.some((rect) => inRect(x, y, rect))
    if (front) kept++
    else image.data[(y * image.width + x) * 4 + 3] = 0
  }
}
await mkdir(OUT, { recursive: true })
await sharp(SOURCE).webp({ quality: QUALITY }).toFile(`${OUT}/bar-back.webp`)
await sharp(PNG.sync.write(image))
  .webp({ quality: QUALITY, alphaQuality: 100 })
  .toFile(`${OUT}/bar-front.webp`)
console.log(
  `✓ back and front; the front covers ${Math.round((kept / (image.width * image.height)) * 100)}% of the image`,
)
