import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://soft-wood-459e.app-ccalc.workers.dev',
        changeOrigin: true,
      },
    },
  },
})
