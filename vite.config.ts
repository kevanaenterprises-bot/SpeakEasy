import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'client',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@assets': path.resolve(__dirname, './attached_assets'),
    },
  },
  build: {
    outDir: '../dist/public',
    chunkSizeWarningLimit: 2000,
  },
})
