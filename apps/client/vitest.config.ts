import { defineConfig } from 'vitest/config'

// No Svelte plugin: the client tests only cover the plain TS logic.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
