import { defineConfig } from 'vitest/config'

// As simulações jogam centenas de partidas com Monte Carlo; levam alguns segundos cada.
export default defineConfig({ test: { testTimeout: 60_000 } })
