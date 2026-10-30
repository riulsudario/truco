// Falas gritadas da mesa, a partir do pacote sound-src/falas.zip (40 WAVs em 5 pastas e um
// falas.csv com o texto). Converte para OGG normalizado em public/sfx/falas/ e gera o
// catálogo src/lib/voice-lines.json, que diz o texto e o momento de cada fala.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ZIP = 'sound-src/falas.zip'
const OUT = 'public/sfx/falas'
/** Pasta do pacote → momento do jogo. "Aumentando" se divide pelo valor gritado. */
const FOLDERS = {
  Truco: 'truco',
  Provocacoes: 'provocacao',
  Vitoria: 'vitoria',
  Derrota: 'derrota',
}
const RAISES = { seis: ['01', '02', '07'], nove: ['03', '05', '08'], doze: ['04', '06'] }

const work = mkdtempSync(join(tmpdir(), 'falas-'))
execFileSync('unzip', ['-q', '-o', ZIP, '-d', work])

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      // A fala vem entre aspas só quando tem vírgula.
      const [, category, file, quoted, plain] = line.match(/^([^,]+),([^,]+),(?:"(.*)"|(.*))$/)
      return { category, file, said: quoted ?? plain }
    })
}

const lines = {}
const add = (moment, entry) => (lines[moment] ??= []).push(entry)
rmSync(OUT, { recursive: true, force: true })
for (const { category, file, said } of parseCsv(readFileSync(join(work, 'falas.csv'), 'utf8'))) {
  const folder = category
  const number = file.slice(0, 2)
  const moment =
    FOLDERS[folder] ?? Object.entries(RAISES).find(([, numbers]) => numbers.includes(number))?.[0]
  if (!moment) throw new Error(`não sei quando tocar ${category}/${file}`)
  mkdirSync(join(OUT, moment), { recursive: true })
  const target = join(OUT, moment, `${number}.ogg`)
  const source = join(work, folder, file)
  // Corta o silêncio das pontas e normaliza o volume, para todas gritarem por igual.
  execFileSync('sox', [
    source,
    '-C',
    '4',
    target,
    'silence',
    '1',
    '0.02',
    '1%',
    'reverse',
    'silence',
    '1',
    '0.02',
    '1%',
    'reverse',
    'gain',
    '-n',
    '-1',
  ])
  add(moment, { file: `falas/${moment}/${number}`, text: said })
}
rmSync(work, { recursive: true, force: true })
writeFileSync('src/lib/voice-lines.json', JSON.stringify(lines, null, 2) + '\n')
console.log(
  Object.entries(lines)
    .map(([m, l]) => `${m}: ${l.length}`)
    .join(', '),
)
