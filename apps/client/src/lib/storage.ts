/** localStorage pode falhar (aba anônima, bloqueio); o jogo funciona sem ele. */
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
    // sem persistência, segue o jogo
  }
}
