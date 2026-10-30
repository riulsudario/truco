import { load, save } from './storage'

/** Volume da jukebox (0 a 100), compartilhado entre o painel e a TV. Salvo no navegador. */
class Music {
  /** Começa baixinho (15%) para a música não atropelar a mesa. */
  volume = $state(Number(load('truco:jukebox-volume', '15')))

  setVolume(volume: number): void {
    this.volume = volume
    save('truco:jukebox-volume', String(volume))
  }
}

export const music = new Music()
