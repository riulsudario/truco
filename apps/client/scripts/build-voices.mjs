// Shouted table lines, from the sound-src/falas.zip pack (40 WAVs in 5 folders and a
// falas.csv with the text). Converts them to normalized OGG in public/sfx/lines/ and writes
// the src/lib/voice-lines.json catalog, which gives each line's text and moment.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ZIP = 'sound-src/falas.zip'
const OUT = 'public/sfx/lines'
/** Pack folder → game moment. "Aumentando" (raises) is split by the value shouted. */
const FOLDERS = {
  Truco: 'truco',
  Provocacoes: 'taunt',
  Vitoria: 'win',
  Derrota: 'loss',
}
const RAISES = { six: ['01', '02', '07'], nine: ['03', '05', '08'], twelve: ['04', '06'] }

const work = mkdtempSync(join(tmpdir(), 'lines-'))
execFileSync('unzip', ['-q', '-o', ZIP, '-d', work])

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      // The line is quoted only when it has a comma.
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
  if (!moment) throw new Error(`don't know when to play ${category}/${file}`)
  mkdirSync(join(OUT, moment), { recursive: true })
  const target = join(OUT, moment, `${number}.ogg`)
  const source = join(work, folder, file)
  // Trims silence at both ends and normalizes volume, so they all shout equally loud.
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
  add(moment, { file: `lines/${moment}/${number}`, text: said })
}
rmSync(work, { recursive: true, force: true })
writeFileSync('src/lib/voice-lines.json', JSON.stringify(lines, null, 2) + '\n')
console.log(
  Object.entries(lines)
    .map(([m, l]) => `${m}: ${l.length}`)
    .join(', '),
)
