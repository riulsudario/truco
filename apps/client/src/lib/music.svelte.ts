import { load, save } from './storage'

/** Jukebox volume (0 to 100), shared by the panel and the TV. Saved in the browser. */
class Music {
  /** Starts low (15%) so the music doesn't drown out the table. */
  volume = $state(Number(load('truco:jukebox-volume', '15')))

  setVolume(volume: number): void {
    this.volume = volume
    save('truco:jukebox-volume', String(volume))
  }
}

export const music = new Music()
