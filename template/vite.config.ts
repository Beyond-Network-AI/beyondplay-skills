// Shared Vite config for kit games (mirrors the platform publish
// template's build-relevant settings: relative base, single dedupe'd bundle,
// small-asset inlining). Each game's vite.config.ts re-exports this.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    chunkSizeWarningLimit: 2000,
    assetsInlineLimit: 2048
  },
  server: {
    host: true,
    port: 5173
  }
})
