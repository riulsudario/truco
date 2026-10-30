import { defineConfig } from 'vitest/config'

// Sem o plugin do Svelte: os testes do cliente cobrem só a lógica em TS puro.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })
