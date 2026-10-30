import { defineConfig } from 'vitest/config'

// The simulations play hundreds of games with Monte Carlo; each takes a few seconds.
export default defineConfig({ test: { testTimeout: 60_000 } })
