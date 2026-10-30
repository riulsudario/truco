/** Loads the YouTube player API once, only when the jukebox is opened. */
interface YouTubeApi {
  Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer
  PlayerState: { ENDED: number; PLAYING: number }
}

export interface YouTubePlayer {
  loadVideoById(options: { videoId: string; startSeconds?: number }): void
  stopVideo(): void
  setVolume(volume: number): void
  getDuration(): number
  destroy(): void
}

let loading: Promise<YouTubeApi> | undefined

export function loadYouTube(): Promise<YouTubeApi> {
  loading ??= new Promise((resolve, reject) => {
    const target = window as unknown as { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void }
    if (target.YT?.Player) return resolve(target.YT)
    target.onYouTubeIframeAPIReady = () => resolve(target.YT!)
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = reject
    document.head.append(script)
  })
  return loading
}
