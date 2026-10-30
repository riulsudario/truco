// Camadas da cena a partir da imagem do bar (scene-src/bar.png):
// - bar-fundo.webp: a imagem inteira;
// - bar-frente.webp: só a borda de madeira, o feltro e o que está em cima da mesa (copos,
//   garrafa, cinzeiro, amendoim), com fundo transparente. O jogo desenha essa camada por
//   cima dos bonecos, então quem senta atrás da mesa fica com o colo escondido.
// Coordenadas em pixels da imagem (1670×941). WebP para a cena não pesar.
import { mkdir, readFile } from 'node:fs/promises'
import { PNG } from 'pngjs'
import sharp from 'sharp'

const SOURCE = 'scene-src/bar.png'
const OUT = 'public/scene'
const QUALITY = 88

/** Tampo e borda de madeira, até a beira de baixo da imagem. */
const TABLE = [
  [367, 555],
  [1253, 555],
  [1670, 800],
  [1670, 941],
  [0, 941],
  [0, 800],
]
/** Objetos que passam da borda da mesa: [x0, y0, x1, y1]. */
const OBJECTS = [
  [745, 530, 828, 622], // caneca do fundo, em frente ao parceiro
  [265, 585, 372, 697], // caneca da esquerda
  [1348, 597, 1455, 710], // caneca da direita
  [40, 664, 142, 900], // garrafa
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
await sharp(SOURCE).webp({ quality: QUALITY }).toFile(`${OUT}/bar-fundo.webp`)
await sharp(PNG.sync.write(image))
  .webp({ quality: QUALITY, alphaQuality: 100 })
  .toFile(`${OUT}/bar-frente.webp`)
console.log(
  `✓ fundo e frente; a frente cobre ${Math.round((kept / (image.width * image.height)) * 100)}% da imagem`,
)
