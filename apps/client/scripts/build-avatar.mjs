// Camadas do boneco customizável, do Universal LPC Spritesheet Character Generator (num
// commit fixo). Para cada peça do catálogo (packages/protocol/src/avatar.ts) baixa a folha
// "sit", recorta o quadro de quem está sentado na cadeira nas três direções que a mesa usa
// e grava uma tira 192×64 [esquerda, frente, direita] em public/avatar/. O manifesto
// src/lib/avatar-sheets.json diz quais tiras compõem cada opção, em que ordem e com que
// paleta recolorir; public/avatar/CREDITS.csv lista os autores das folhas usadas.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PNG } from 'pngjs'
import * as catalog from '../../../packages/protocol/src/avatar.ts'

const SHA = '86160e7507d6841259cff624a51a63c1d4847ee3'
const RAW = `https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/${SHA}/`
const CACHE = '../../assets-src/lpc'
const OUT = 'public/avatar'
const FRAME = 64
/** Linhas da folha "sit" (esquerda, frente, direita) e a coluna do sentado na cadeira. */
const ROWS = [1, 2, 3]
const COLUMN = 2
const BODY_TYPE = { masculino: 'male', feminino: 'female' }
const EYES = { z: 105, path: 'eyes/human/adult/default/', material: 'eye' }

async function file(rel) {
  const path = join(CACHE, rel)
  try {
    return await readFile(path)
  } catch {
    const response = await fetch(RAW + rel)
    if (!response.ok) throw new Error(`${response.status} ao baixar ${rel}`)
    const data = Buffer.from(await response.arrayBuffer())
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
    return data
  }
}
const json = async (rel) => JSON.parse((await file(rel)).toString())

const used = new Set()
const strips = new Map()

/** Recorta a tira de uma folha e devolve o nome do arquivo gravado. */
async function strip(sheetPath) {
  if (strips.has(sheetPath)) return strips.get(sheetPath)
  const sheet = PNG.sync.read(await file(`spritesheets/${sheetPath}`))
  const out = new PNG({ width: FRAME * ROWS.length, height: FRAME })
  ROWS.forEach((row, i) =>
    PNG.bitblt(sheet, out, COLUMN * FRAME, row * FRAME, FRAME, FRAME, i * FRAME, 0),
  )
  const name = sheetPath.replace(/\.png$/, '').replaceAll('/', '_') + '.png'
  await writeFile(join(OUT, name), PNG.sync.write(out))
  used.add(sheetPath)
  strips.set(sheetPath, name)
  return name
}

/** Camadas de uma opção para um tipo de corpo: [{ file, z, material }]. */
async function layersOf(option, body) {
  if (!option.def) return []
  const def = await json(`sheet_definitions/${option.def}`)
  const material = option.variant
    ? null
    : (def.recolors?.material ?? def.recolors?.color_1?.material)
  const layers = []
  for (const [key, layer] of Object.entries(def)) {
    const dir = key.startsWith('layer_') && layer[BODY_TYPE[body]]
    if (!dir) continue
    const sheet = option.variant ? `${dir}sit/${option.variant}.png` : `${dir}sit.png`
    layers.push({ file: await strip(sheet), z: layer.zPos, material })
  }
  if (layers.length === 0) throw new Error(`${option.def} não tem camada para ${body}`)
  return layers
}

await mkdir(OUT, { recursive: true })
const parts = {}
const PART_FIELDS = {
  hair: catalog.HAIR_STYLES,
  shirt: catalog.SHIRTS,
  pants: catalog.PANTS,
  facialHair: catalog.FACIAL_HAIR,
  glasses: catalog.GLASSES,
  hat: catalog.HATS,
}
for (const body of Object.keys(catalog.BODIES)) {
  parts[`base:${body}`] = [
    ...(await layersOf({ def: 'body/body.json' }, body)),
    ...(await layersOf({ def: catalog.BODIES[body].head }, body)),
    { file: await strip(`${EYES.path}sit.png`), z: EYES.z, material: EYES.material },
  ]
  for (const [field, options] of Object.entries(PART_FIELDS)) {
    for (const [id, option] of Object.entries(options)) {
      parts[`${field}:${id}:${body}`] = await layersOf(option, body)
    }
  }
  console.log(`✓ peças do corpo ${body}`)
}

// Paletas: a de origem de cada material e só as cores que o catálogo usa.
const wanted = {
  body: Object.values(catalog.SKIN_TONES).map((tone) => tone.palette),
  hair: Object.values(catalog.HAIR_COLORS).map((color) => color.palette),
  cloth: Object.values(catalog.CLOTH_COLORS).map((color) => color.palette),
  eye: ['brown'],
}
const palettes = {}
for (const [material, colors] of Object.entries(wanted)) {
  const meta = await json(`palette_definitions/${material}/meta_${material}.json`)
  const all = await json(`palette_definitions/${material}/${material}_ulpc.json`)
  palettes[material] = {
    source: all[meta.base],
    colors: Object.fromEntries(colors.map((c) => [c, all[c]])),
  }
}

await writeFile(
  'src/lib/avatar-sheets.json',
  JSON.stringify({ frame: FRAME, palettes, parts }) + '\n',
)

const credits = (await file('CREDITS.csv')).toString().split('\n')
const covered = (name) =>
  [...used].some((sheet) => sheet === name || sheet.startsWith(name.replace(/\.png$/, '/')))
const rows = credits.filter((line, i) => i === 0 || covered(line.match(/^"([^"]+)"/)?.[1] ?? '\0'))
await writeFile(join(OUT, 'CREDITS.csv'), rows.join('\n') + '\n')
console.log(`✓ ${strips.size} tiras, ${rows.length - 1} linhas de créditos`)
