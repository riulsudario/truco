/** Routes: "/" is the menu, "/sala/ABCD" is a room. */
class Router {
  path = $state(location.pathname)

  constructor() {
    addEventListener('popstate', () => (this.path = location.pathname))
  }

  get roomCode(): string | null {
    const match = this.path.match(/^\/sala\/([A-Za-z]{4})$/)
    return match ? match[1]!.toUpperCase() : null
  }

  go(path: string): void {
    if (path === this.path) return
    history.pushState(null, '', path)
    this.path = path
  }
}

export const router = new Router()
