/**
 * Catálogo do boneco customizável, montado em camadas do Universal LPC. Cada opção aponta
 * para a definição da peça no gerador do LPC (sheet_definitions/…); o script
 * apps/client/scripts/build-avatar.mjs baixa só o que está aqui.
 *
 * Peças com `variant` vêm pintadas de fábrica (chapéu, óculos); as outras são recoloridas
 * pelas paletas do LPC no navegador.
 */

export interface PartOption {
  label: string
  /** Definição no gerador do LPC; null quando a opção é "nenhum". */
  def: string | null
  /** Variante pré-pintada; quando ausente, a peça é recolorida. */
  variant?: string
}

const none: PartOption = { label: 'Nenhum', def: null }

export const BODIES = {
  masculino: { label: 'Masculino', head: 'head/heads/human/heads_human_male.json' },
  feminino: { label: 'Feminino', head: 'head/heads/human/heads_human_female.json' },
} as const

export const SKIN_TONES = {
  clara: { label: 'Clara', palette: 'light' },
  bege: { label: 'Bege', palette: 'amber' },
  morena: { label: 'Morena', palette: 'olive' },
  parda: { label: 'Parda', palette: 'taupe' },
  bronze: { label: 'Bronze', palette: 'bronze' },
  marrom: { label: 'Marrom', palette: 'brown' },
  preta: { label: 'Preta', palette: 'black' },
} as const

export const HAIR_STYLES = {
  careca: none,
  liso: { label: 'Liso', def: 'hair/short/hair_plain.json' },
  raspado: { label: 'Raspado', def: 'hair/bald/hair_buzzcut.json' },
  calvo: { label: 'Calvo', def: 'hair/bald/hair_balding.json' },
  espetado: { label: 'Espetado', def: 'hair/spiky/hair_spiked.json' },
  baguncado: { label: 'Bagunçado', def: 'hair/short/hair_messy1.json' },
  joaozinho: { label: 'Joãozinho', def: 'hair/short/hair_pixie.json' },
  chanel: { label: 'Chanel', def: 'hair/bob/hair_bob.json' },
  coque: { label: 'Coque', def: 'hair/braids/hair_bangs_bun.json' },
  rabo: { label: 'Rabo de cavalo', def: 'hair/braids/hair_ponytail.json' },
  comprido: { label: 'Comprido', def: 'hair/long/hair_long.json' },
  cacheado: { label: 'Cacheado', def: 'hair/curly/hair_curly_short.json' },
  cachos: { label: 'Cachos longos', def: 'hair/curly/hair_curly_long.json' },
  blackpower: { label: 'Black power', def: 'hair/afro/hair_afro.json' },
} as const satisfies Record<string, PartOption>

export const HAIR_COLORS = {
  preto: { label: 'Preto', palette: 'black' },
  castanho: { label: 'Castanho', palette: 'dark_brown' },
  'castanho-claro': { label: 'Castanho-claro', palette: 'chestnut' },
  loiro: { label: 'Loiro', palette: 'blonde' },
  ruivo: { label: 'Ruivo', palette: 'ginger' },
  grisalho: { label: 'Grisalho', palette: 'gray' },
  branco: { label: 'Branco', palette: 'white' },
  rosa: { label: 'Rosa', palette: 'pink' },
  azul: { label: 'Azul', palette: 'blue' },
} as const

export const SHIRTS = {
  camiseta: { label: 'Camiseta', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt.json' },
  'gola-v': { label: 'Gola V', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_vneck.json' },
  regata: { label: 'Regata', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless1.json' },
  polo: { label: 'Polo', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_polo.json' },
  cardiga: {
    label: 'Cardigã',
    def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan.json',
  },
} as const satisfies Record<string, PartOption>

export const PANTS = {
  calca: { label: 'Calça', def: 'legs/pants/legs_pants.json' },
  bermuda: { label: 'Bermuda', def: 'legs/shorts/legs_shorts.json' },
} as const satisfies Record<string, PartOption>

/** Cores de roupa: paleta "cloth" do LPC. */
export const CLOTH_COLORS = {
  branco: { label: 'Branco', palette: 'white' },
  preto: { label: 'Preto', palette: 'black' },
  cinza: { label: 'Cinza', palette: 'gray' },
  vermelho: { label: 'Vermelho', palette: 'red' },
  vinho: { label: 'Vinho', palette: 'maroon' },
  laranja: { label: 'Laranja', palette: 'orange' },
  amarelo: { label: 'Amarelo', palette: 'yellow' },
  verde: { label: 'Verde', palette: 'green' },
  'verde-escuro': { label: 'Verde-escuro', palette: 'forest' },
  azul: { label: 'Azul', palette: 'blue' },
  marinho: { label: 'Marinho', palette: 'navy' },
  roxo: { label: 'Roxo', palette: 'purple' },
  rosa: { label: 'Rosa', palette: 'pink' },
  marrom: { label: 'Marrom', palette: 'brown' },
} as const

export const FACIAL_HAIR = {
  nenhum: none,
  bigode: { label: 'Bigode', def: 'hair/mustaches/beards_mustache.json' },
  bigodao: { label: 'Bigodão', def: 'hair/mustaches/beards_bigstache.json' },
  aparada: { label: 'Barba aparada', def: 'hair/beards/beards_trimmed.json' },
  barba: { label: 'Barba', def: 'hair/beards/beards_beard.json' },
  barbudo: { label: 'Barbudo', def: 'hair/beards/beards_medium.json' },
} as const satisfies Record<string, PartOption>

export const GLASSES = {
  nenhum: none,
  oculos: {
    label: 'Óculos',
    def: 'headwear/accessories/glasses/facial_glasses.json',
    variant: 'black',
  },
  redondo: {
    label: 'Redondo',
    def: 'headwear/accessories/glasses/facial_glasses_round.json',
    variant: 'brown',
  },
  nerd: {
    label: 'Nerd',
    def: 'headwear/accessories/glasses/facial_glasses_nerd.json',
    variant: 'black',
  },
  escuro: {
    label: 'Escuro',
    def: 'headwear/accessories/glasses/facial_glasses_sunglasses.json',
    variant: 'sunglasses',
  },
} as const satisfies Record<string, PartOption>

export const HATS = {
  nenhum: none,
  'chapeu-preto': {
    label: 'Chapéu preto',
    def: 'headwear/hats/formal/hat_formal_bowler.json',
    variant: 'black',
  },
  'chapeu-marrom': {
    label: 'Chapéu marrom',
    def: 'headwear/hats/formal/hat_formal_bowler.json',
    variant: 'brown',
  },
  bandana: { label: 'Bandana', def: 'headwear/coverings/bandana/hat_bandana.json' },
} as const satisfies Record<string, PartOption>

/**
 * Vozes das falas gravadas (audio-pipeline/). Qualquer voz fala qualquer fala; o gênero só
 * serve para dar a quem não escolheu uma voz que combine com o corpo do boneco.
 */
export const VOICES = {
  tiao: { label: 'Tião', gender: 'masculino' },
  juninho: { label: 'Juninho', gender: 'masculino' },
  ze: { label: 'Zé', gender: 'masculino' },
  tonhao: { label: 'Tonhão', gender: 'masculino' },
  dona_cida: { label: 'Dona Cida', gender: 'feminino' },
  jessica: { label: 'Jéssica', gender: 'feminino' },
} as const satisfies Record<string, { label: string; gender: BodyId }>

export type BodyId = keyof typeof BODIES
export type SkinToneId = keyof typeof SKIN_TONES
export type HairStyleId = keyof typeof HAIR_STYLES
export type HairColorId = keyof typeof HAIR_COLORS
export type ShirtId = keyof typeof SHIRTS
export type PantsId = keyof typeof PANTS
export type ClothColorId = keyof typeof CLOTH_COLORS
export type FacialHairId = keyof typeof FACIAL_HAIR
export type GlassesId = keyof typeof GLASSES
export type HatId = keyof typeof HATS
export type VoiceId = keyof typeof VOICES

export interface Avatar {
  body: BodyId
  skin: SkinToneId
  hair: HairStyleId
  hairColor: HairColorId
  shirt: ShirtId
  shirtColor: ClothColorId
  pants: PantsId
  pantsColor: ClothColorId
  facialHair: FacialHairId
  glasses: GlassesId
  hat: HatId
  /** Cor da bandana (as outras peças de cabeça vêm pintadas). */
  hatColor: ClothColorId
  /** Voz das falas gravadas; sem ela, sai uma do gênero do corpo, sorteada pelo nome. */
  voice?: VoiceId
}

export const DEFAULT_AVATAR: Avatar = {
  body: 'masculino',
  skin: 'morena',
  hair: 'liso',
  hairColor: 'castanho',
  shirt: 'camiseta',
  shirtColor: 'azul',
  pants: 'calca',
  pantsColor: 'marinho',
  facialHair: 'nenhum',
  glasses: 'nenhum',
  hat: 'nenhum',
  hatColor: 'vermelho',
}

/** Bots da casa têm visual fixo; quem vira bot no lugar de alguém herda o visual da pessoa. */
export const BOT_AVATARS: Record<string, Avatar> = {
  Tonhão: {
    ...DEFAULT_AVATAR,
    voice: 'tonhao',
    skin: 'marrom',
    hair: 'raspado',
    hairColor: 'preto',
    shirt: 'regata',
    shirtColor: 'branco',
    facialHair: 'bigodao',
  },
  'Dona Cida': {
    ...DEFAULT_AVATAR,
    voice: 'dona_cida',
    body: 'feminino',
    skin: 'clara',
    hair: 'coque',
    hairColor: 'grisalho',
    shirt: 'cardiga',
    shirtColor: 'roxo',
    pantsColor: 'preto',
    glasses: 'redondo',
  },
  'Zé do Bar': {
    ...DEFAULT_AVATAR,
    voice: 'ze',
    skin: 'parda',
    hair: 'baguncado',
    hairColor: 'preto',
    shirt: 'camiseta',
    shirtColor: 'amarelo',
    pants: 'bermuda',
    pantsColor: 'azul',
    facialHair: 'bigode',
  },
  'Seu Lunga': {
    ...DEFAULT_AVATAR,
    voice: 'tiao',
    skin: 'bronze',
    hair: 'calvo',
    hairColor: 'branco',
    shirt: 'polo',
    shirtColor: 'verde-escuro',
    facialHair: 'barbudo',
    hat: 'chapeu-marrom',
  },
  'Tia Neide': {
    ...DEFAULT_AVATAR,
    voice: 'jessica',
    body: 'feminino',
    skin: 'preta',
    hair: 'blackpower',
    hairColor: 'preto',
    shirt: 'gola-v',
    shirtColor: 'laranja',
    pantsColor: 'preto',
  },
  'Pé de Pano': {
    ...DEFAULT_AVATAR,
    voice: 'juninho',
    skin: 'bege',
    hair: 'espetado',
    hairColor: 'ruivo',
    shirt: 'camiseta',
    shirtColor: 'verde',
    facialHair: 'aparada',
    hat: 'bandana',
    hatColor: 'vermelho',
  },
}

/** Todas as escolhas possíveis por campo, para validar e para o editor. */
export const AVATAR_OPTIONS = {
  body: BODIES,
  skin: SKIN_TONES,
  hair: HAIR_STYLES,
  hairColor: HAIR_COLORS,
  shirt: SHIRTS,
  shirtColor: CLOTH_COLORS,
  pants: PANTS,
  pantsColor: CLOTH_COLORS,
  facialHair: FACIAL_HAIR,
  glasses: GLASSES,
  hat: HATS,
  hatColor: CLOTH_COLORS,
  voice: VOICES,
} as const satisfies Record<keyof Avatar, Record<string, { label: string }>>
