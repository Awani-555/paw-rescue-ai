import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this repo as a project site at /paw-rescue-ai/, not
// at the domain root, so production asset URLs need that prefix there.
// Vercel serves it from the domain root instead (Vercel sets VERCEL=1
// during its own build), and local dev is also served from root.
export default defineConfig(({ command }) => ({
  base: command === 'build' && !process.env.VERCEL ? '/paw-rescue-ai/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
  },
}))
