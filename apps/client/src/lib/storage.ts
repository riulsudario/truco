/** localStorage can fail (private tab, blocked); the game works without it. */
export function load(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // no persistence, the game goes on
  }
}
