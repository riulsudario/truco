import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, type Avatar } from '@truco/protocol'
import sheets from './avatar-sheets.json'

/** Direções da tira: virado para a esquerda, de frente, virado para a direita. */
export type Facing = 'left' | 'front' | 'right'
const COLUMN: Record<Facing, number> = { left: 0, front: 1, right: 2 }

interface Layer {
  file: string
  z: number
  material: 'body' | 'hair' | 'cloth' | 'eye' | null
}
type Rgb = [number, number, number]
const FRAME = sheets.frame
const parts = sheets.parts as Record<string, Layer[]>
const palettes = sheets.palettes as Record<
  string,
  { source: string[]; colors: Record<string, string[]> }
>

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb
/** Algumas folhas fogem alguns tons da paleta de origem; casa pela cor mais próxima. */
const TOLERANCE = 16

const images = new Map<string, Promise<HTMLImageElement>>()
function image(file: string): Promise<HTMLImageElement> {
  let loading = images.get(file)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = `/avatar/${file}`
    })
    images.set(file, loading)
  }
  return loading
}

/** Camadas do boneco em ordem de desenho, cada uma com a cor de destino. */
function layersOf(avatar: Avatar): { layer: Layer; color: string | null }[] {
  const pick = (key: string) => parts[key] ?? []
  const all = [
    ...pick(`base:${avatar.body}`),
    ...pick(`pants:${avatar.pants}:${avatar.body}`).map((l) => ({ ...l, tint: 'pants' })),
    ...pick(`shirt:${avatar.shirt}:${avatar.body}`).map((l) => ({ ...l, tint: 'shirt' })),
    ...pick(`hair:${avatar.hair}:${avatar.body}`),
    ...pick(`facialHair:${avatar.facialHair}:${avatar.body}`),
    ...pick(`glasses:${avatar.glasses}:${avatar.body}`),
    ...pick(`hat:${avatar.hat}:${avatar.body}`).map((l) => ({ ...l, tint: 'hat' })),
  ] as (Layer & { tint?: 'pants' | 'shirt' | 'hat' })[]
  const cloth = { pants: avatar.pantsColor, shirt: avatar.shirtColor, hat: avatar.hatColor }
  return all
    .sort((a, b) => a.z - b.z)
    .map((layer) => {
      switch (layer.material) {
        case 'body':
          return { layer, color: SKIN_TONES[avatar.skin].palette }
        case 'hair':
          return { layer, color: HAIR_COLORS[avatar.hairColor].palette }
        case 'cloth':
          return { layer, color: CLOTH_COLORS[cloth[layer.tint ?? 'shirt']].palette }
        case 'eye':
          return { layer, color: 'brown' }
        default:
          return { layer, color: null }
      }
    })
}

function recolor(data: Uint8ClampedArray, material: string, color: string): void {
  const palette = palettes[material]
  const target = palette?.colors[color]
  if (!palette || !target) return
  const from = palette.source.map(hex)
  const to = target.map(hex)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    let best = -1
    let bestDistance = TOLERANCE + 1
    from.forEach((c, k) => {
      const d = Math.max(
        Math.abs(c[0] - data[i]!),
        Math.abs(c[1] - data[i + 1]!),
        Math.abs(c[2] - data[i + 2]!),
      )
      if (d < bestDistance) {
        bestDistance = d
        best = k
      }
    })
    if (best >= 0) [data[i], data[i + 1], data[i + 2]] = to[best]!
  }
}

const cache = new Map<string, Promise<HTMLCanvasElement>>()

/** Boneco sentado (64×64) olhando para a direção dada. */
export function renderAvatar(avatar: Avatar, facing: Facing): Promise<HTMLCanvasElement> {
  const key = `${JSON.stringify(avatar)}|${facing}`
  let rendering = cache.get(key)
  if (!rendering) {
    rendering = draw(avatar, facing)
    cache.set(key, rendering)
  }
  return rendering
}

async function draw(avatar: Avatar, facing: Facing): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = FRAME
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const scratch = document.createElement('canvas')
  scratch.width = scratch.height = FRAME
  const sctx = scratch.getContext('2d', { willReadFrequently: true })!
  for (const { layer, color } of layersOf(avatar)) {
    const img = await image(layer.file)
    sctx.clearRect(0, 0, FRAME, FRAME)
    sctx.drawImage(img, COLUMN[facing] * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME)
    if (layer.material && color) {
      const pixels = sctx.getImageData(0, 0, FRAME, FRAME)
      recolor(pixels.data, layer.material, color)
      sctx.putImageData(pixels, 0, 0)
    }
    ctx.drawImage(scratch, 0, 0)
  }
  return canvas
}

/** Tons da pele do boneco (contorno, sombra, base, luz), para desenhar as mãos. */
export function skinTones(avatar: Avatar): {
  outline: string
  shadow: string
  base: string
  light: string
} {
  const colors = palettes.body?.colors[SKIN_TONES[avatar.skin].palette] ?? []
  return {
    outline: colors[0] ?? '#271920',
    shadow: colors[2] ?? '#99423c',
    base: colors[3] ?? '#e4a47c',
    light: colors[4] ?? '#f9d5ba',
  }
}
