import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 9700,
    strictPort: true,
  },
  clearScreen: false,
  test: {
    include: ['src/**/*.test.ts'],
  },
})
