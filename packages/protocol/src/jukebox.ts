/**
 * Músicas da jukebox: vídeos dos canais oficiais no YouTube (VEVO, "Topic" e canais das
 * duplas), conferidos pelo oEmbed. Tocam pelo player embutido do YouTube, que fica
 * visível como manda o termo de uso; nada é baixado.
 */
export const JUKEBOX_TRACKS = [
  {
    id: 'e-o-amor',
    title: 'É o Amor',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: 'Be6ROem9ms8',
  },
  {
    id: 'entre-tapas',
    title: 'Entre Tapas e Beijos',
    artist: 'Leandro & Leonardo',
    youtube: 'bSl8qASavmE',
  },
  { id: 'evidencias', title: 'Evidências', artist: 'Chitãozinho & Xororó', youtube: 'ePjtnSPFWK8' },
  {
    id: 'pense-em-mim',
    title: 'Pense em Mim',
    artist: 'Leandro & Leonardo',
    youtube: 'VD5RrI3w9Ws',
  },
  {
    id: 'no-dia',
    title: 'No Dia em Que Eu Saí de Casa',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: '5ukX7atxjeI',
  },
  {
    id: 'desculpe',
    title: 'Desculpe, Mas Eu Vou Chorar',
    artist: 'Leandro & Leonardo',
    youtube: 'W6wAWdd_p5Q',
  },
  {
    id: 'fio-de-cabelo',
    title: 'Fio de Cabelo',
    artist: 'Chitãozinho & Xororó',
    youtube: '48kf5eG5yeY',
  },
  {
    id: 'estou-apaixonado',
    title: 'Estou Apaixonado',
    artist: 'João Paulo & Daniel',
    youtube: 'GmQ-8REaHtw',
  },
  {
    id: 'dormi-na-praca',
    title: 'Dormi na Praça',
    artist: 'Bruno & Marrone',
    youtube: 'uWX0O8ATY3k',
  },
  {
    id: 'peao-apaixonado',
    title: 'Peão Apaixonado',
    artist: 'Rionegro & Solimões',
    youtube: 'KIGHS165bZE',
  },
  {
    id: 'pao-de-mel',
    title: 'Pão de Mel',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: 'QiEvdfNoQK0',
  },
  {
    id: 'horizonte-azul',
    title: 'Horizonte Azul',
    artist: 'Leandro & Leonardo',
    youtube: 'et4nF63CvNI',
  },
  {
    id: 'diz-pro-meu-olhar',
    title: 'Diz Pro Meu Olhar',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: '8gsVNHB0wkM',
  },
  {
    id: 'nem-e-bom-lembrar',
    title: 'Nem É Bom Lembrar',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: 'y6PIpZpkIps',
  },
  {
    id: 'rumo-a-goiania',
    title: 'Rumo a Goiânia',
    artist: 'Leandro & Leonardo',
    youtube: '766qOtcIUh4',
  },
  { id: 'um-sonhador', title: 'Um Sonhador', artist: 'Leandro & Leonardo', youtube: 'Tw6vosUnGdc' },
  {
    id: 'sublime-renuncia',
    title: 'Sublime Renúncia',
    artist: 'Leandro & Leonardo',
    youtube: 'sMcmG2eLBXU',
  },
  { id: 'talisma', title: 'Talismã', artist: 'Leandro & Leonardo', youtube: '2xrppJrllv8' },
  {
    id: 'cada-volta',
    title: 'Cada Volta É um Recomeço',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: 'JPNDEZb9RAQ',
  },
  {
    id: 'me-leva-pra-casa',
    title: 'Me Leva Pra Casa',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: 'VxwX99fgVF0',
  },
  {
    id: 'irmao-da-lua',
    title: 'Irmão da Lua, Amigo das Estrelas',
    artist: 'Zezé Di Camargo & Luciano',
    youtube: 'n7RoCG6O0Ew',
  },
  {
    id: 'grande-amor',
    title: 'Quando Um Grande Amor Se Faz',
    artist: 'Cleiton & Camargo',
    youtube: '7cdAzos8RAw',
  },
  {
    id: 'ceu-dos-bracos',
    title: 'No Céu dos Braços Teus',
    artist: 'Di Paullo & Paulino',
    youtube: '64vYkhmsagM',
  },
  {
    id: 'agora-somos-ex',
    title: 'Agora Somos Ex',
    artist: 'Léo Magalhães',
    youtube: 'S5mQgNlG-48',
  },
  { id: 'o-cara-errado', title: 'O Cara Errado', artist: 'Léo Magalhães', youtube: 'nJ_tNakn10I' },
  { id: 'a-fila-anda', title: 'A Fila Anda', artist: 'Léo Magalhães', youtube: 'ujJItzZNx3s' },
] as const

export type TrackId = (typeof JUKEBOX_TRACKS)[number]['id']
export const TRACK_IDS = JUKEBOX_TRACKS.map((track) => track.id) as [TrackId, ...TrackId[]]

/** O que a jukebox da sala está tocando; startedAt é o relógio do servidor (epoch ms). */
export interface JukeboxState {
  trackId: TrackId | null
  startedAt: number | null
}

export const JUKEBOX_COOLDOWN_MS = 3000

/** Próxima faixa da lista, dando a volta no fim. */
export function nextTrack(current: TrackId | null): TrackId {
  const index = current ? TRACK_IDS.indexOf(current) : -1
  return TRACK_IDS[(index + 1) % TRACK_IDS.length]!
}
