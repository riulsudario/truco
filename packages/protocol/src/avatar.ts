/**
 * Catalog of the customizable character, built from Universal LPC layers. Each option points
 * to the piece's definition in the LPC generator (sheet_definitions/…); the script
 * apps/client/scripts/build-avatar.mjs downloads only what is listed here.
 *
 * Pieces with a `variant` come pre-painted (hat, glasses); the others are recolored with
 * the LPC palettes in the browser.
 */

export interface PartOption {
  label: string
  /** Definition in the LPC generator; null when the option is "none". */
  def: string | null
  /** Pre-painted variant; when absent, the piece is recolored. */
  variant?: string
}

const none: PartOption = { label: 'Nenhum', def: null }

export const BODIES = {
  male: { label: 'Masculino', head: 'head/heads/human/heads_human_male.json' },
  female: { label: 'Feminino', head: 'head/heads/human/heads_human_female.json' },
} as const

export const SKIN_TONES = {
  light: { label: 'Clara', palette: 'light' },
  beige: { label: 'Bege', palette: 'amber' },
  olive: { label: 'Morena', palette: 'olive' },
  tan: { label: 'Parda', palette: 'taupe' },
  bronze: { label: 'Bronze', palette: 'bronze' },
  brown: { label: 'Marrom', palette: 'brown' },
  black: { label: 'Preta', palette: 'black' },
} as const

export const HAIR_STYLES = {
  bald: none,
  straight: { label: 'Liso', def: 'hair/short/hair_plain.json' },
  buzzcut: { label: 'Raspado', def: 'hair/bald/hair_buzzcut.json' },
  balding: { label: 'Calvo', def: 'hair/bald/hair_balding.json' },
  spiky: { label: 'Espetado', def: 'hair/spiky/hair_spiked.json' },
  messy: { label: 'Bagunçado', def: 'hair/short/hair_messy1.json' },
  pixie: { label: 'Joãozinho', def: 'hair/short/hair_pixie.json' },
  bob: { label: 'Chanel', def: 'hair/bob/hair_bob.json' },
  bun: { label: 'Coque', def: 'hair/braids/hair_bangs_bun.json' },
  ponytail: { label: 'Rabo de cavalo', def: 'hair/braids/hair_ponytail.json' },
  long: { label: 'Comprido', def: 'hair/long/hair_long.json' },
  curly: { label: 'Cacheado', def: 'hair/curly/hair_curly_short.json' },
  'long-curls': { label: 'Cachos longos', def: 'hair/curly/hair_curly_long.json' },
  afro: { label: 'Black power', def: 'hair/afro/hair_afro.json' },
} as const satisfies Record<string, PartOption>

export const HAIR_COLORS = {
  black: { label: 'Preto', palette: 'black' },
  brown: { label: 'Castanho', palette: 'dark_brown' },
  'light-brown': { label: 'Castanho-claro', palette: 'chestnut' },
  blonde: { label: 'Loiro', palette: 'blonde' },
  red: { label: 'Ruivo', palette: 'ginger' },
  gray: { label: 'Grisalho', palette: 'gray' },
  white: { label: 'Branco', palette: 'white' },
  pink: { label: 'Rosa', palette: 'pink' },
  blue: { label: 'Azul', palette: 'blue' },
} as const

export const SHIRTS = {
  tshirt: { label: 'Camiseta', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt.json' },
  vneck: { label: 'Gola V', def: 'torso/shirts/shortsleeve/torso_clothes_tshirt_vneck.json' },
  tank: { label: 'Regata', def: 'torso/shirts/sleeveless/torso_clothes_sleeveless1.json' },
  polo: { label: 'Polo', def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_polo.json' },
  cardigan: {
    label: 'Cardigã',
    def: 'torso/shirts/longsleeve/torso_clothes_longsleeve2_cardigan.json',
  },
} as const satisfies Record<string, PartOption>

export const PANTS = {
  pants: { label: 'Calça', def: 'legs/pants/legs_pants.json' },
  shorts: { label: 'Bermuda', def: 'legs/shorts/legs_shorts.json' },
} as const satisfies Record<string, PartOption>

/** Clothing colors: the LPC "cloth" palette. */
export const CLOTH_COLORS = {
  white: { label: 'Branco', palette: 'white' },
  black: { label: 'Preto', palette: 'black' },
  gray: { label: 'Cinza', palette: 'gray' },
  red: { label: 'Vermelho', palette: 'red' },
  maroon: { label: 'Vinho', palette: 'maroon' },
  orange: { label: 'Laranja', palette: 'orange' },
  yellow: { label: 'Amarelo', palette: 'yellow' },
  green: { label: 'Verde', palette: 'green' },
  'dark-green': { label: 'Verde-escuro', palette: 'forest' },
  blue: { label: 'Azul', palette: 'blue' },
  navy: { label: 'Marinho', palette: 'navy' },
  purple: { label: 'Roxo', palette: 'purple' },
  pink: { label: 'Rosa', palette: 'pink' },
  brown: { label: 'Marrom', palette: 'brown' },
} as const

export const FACIAL_HAIR = {
  none: none,
  mustache: { label: 'Bigode', def: 'hair/mustaches/beards_mustache.json' },
  'big-mustache': { label: 'Bigodão', def: 'hair/mustaches/beards_bigstache.json' },
  trimmed: { label: 'Barba aparada', def: 'hair/beards/beards_trimmed.json' },
  beard: { label: 'Barba', def: 'hair/beards/beards_beard.json' },
  'full-beard': { label: 'Barbudo', def: 'hair/beards/beards_medium.json' },
} as const satisfies Record<string, PartOption>

export const GLASSES = {
  none: none,
  glasses: {
    label: 'Óculos',
    def: 'headwear/accessories/glasses/facial_glasses.json',
    variant: 'black',
  },
  round: {
    label: 'Redondo',
    def: 'headwear/accessories/glasses/facial_glasses_round.json',
    variant: 'brown',
  },
  nerd: {
    label: 'Nerd',
    def: 'headwear/accessories/glasses/facial_glasses_nerd.json',
    variant: 'black',
  },
  sunglasses: {
    label: 'Escuro',
    def: 'headwear/accessories/glasses/facial_glasses_sunglasses.json',
    variant: 'sunglasses',
  },
} as const satisfies Record<string, PartOption>

export const HATS = {
  none: none,
  'black-hat': {
    label: 'Chapéu preto',
    def: 'headwear/hats/formal/hat_formal_bowler.json',
    variant: 'black',
  },
  'brown-hat': {
    label: 'Chapéu marrom',
    def: 'headwear/hats/formal/hat_formal_bowler.json',
    variant: 'brown',
  },
  bandana: { label: 'Bandana', def: 'headwear/coverings/bandana/hat_bandana.json' },
} as const satisfies Record<string, PartOption>

/**
 * Voices of the recorded lines (audio-pipeline/). Any voice says any line; the gender only
 * serves to give whoever didn't pick a voice one that matches the character's body.
 */
export const VOICES = {
  tiao: { label: 'Tião', gender: 'male' },
  juninho: { label: 'Juninho', gender: 'male' },
  ze: { label: 'Zé', gender: 'male' },
  tonhao: { label: 'Tonhão', gender: 'male' },
  dona_cida: { label: 'Dona Cida', gender: 'female' },
  jessica: { label: 'Jéssica', gender: 'female' },
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
  /** Bandana color (the other headwear comes pre-painted). */
  hatColor: ClothColorId
  /** Voice of the recorded lines; without one, a voice of the body's gender is picked from the name. */
  voice?: VoiceId
}

export const DEFAULT_AVATAR: Avatar = {
  body: 'male',
  skin: 'olive',
  hair: 'straight',
  hairColor: 'brown',
  shirt: 'tshirt',
  shirtColor: 'blue',
  pants: 'pants',
  pantsColor: 'navy',
  facialHair: 'none',
  glasses: 'none',
  hat: 'none',
  hatColor: 'red',
}

/** House bots have a fixed look; a bot that takes over someone's seat inherits that person's look. */
export const BOT_AVATARS: Record<string, Avatar> = {
  Tonhão: {
    ...DEFAULT_AVATAR,
    voice: 'tonhao',
    skin: 'brown',
    hair: 'buzzcut',
    hairColor: 'black',
    shirt: 'tank',
    shirtColor: 'white',
    facialHair: 'big-mustache',
  },
  'Dona Cida': {
    ...DEFAULT_AVATAR,
    voice: 'dona_cida',
    body: 'female',
    skin: 'light',
    hair: 'bun',
    hairColor: 'gray',
    shirt: 'cardigan',
    shirtColor: 'purple',
    pantsColor: 'black',
    glasses: 'round',
  },
  'Zé do Bar': {
    ...DEFAULT_AVATAR,
    voice: 'ze',
    skin: 'tan',
    hair: 'messy',
    hairColor: 'black',
    shirt: 'tshirt',
    shirtColor: 'yellow',
    pants: 'shorts',
    pantsColor: 'blue',
    facialHair: 'mustache',
  },
  'Seu Lunga': {
    ...DEFAULT_AVATAR,
    voice: 'tiao',
    skin: 'bronze',
    hair: 'balding',
    hairColor: 'white',
    shirt: 'polo',
    shirtColor: 'dark-green',
    facialHair: 'full-beard',
    hat: 'brown-hat',
  },
  'Tia Neide': {
    ...DEFAULT_AVATAR,
    voice: 'jessica',
    body: 'female',
    skin: 'black',
    hair: 'afro',
    hairColor: 'black',
    shirt: 'vneck',
    shirtColor: 'orange',
    pantsColor: 'black',
  },
  'Pé de Pano': {
    ...DEFAULT_AVATAR,
    voice: 'juninho',
    skin: 'beige',
    hair: 'spiky',
    hairColor: 'red',
    shirt: 'tshirt',
    shirtColor: 'green',
    facialHair: 'trimmed',
    hat: 'bandana',
    hatColor: 'red',
  },
}

/** Every possible choice per field, for validation and for the editor. */
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
