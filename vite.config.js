import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env vars regardless of the VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          // Use the variable loaded from your .env file
          target: env.R2_PUBLIC_BASE_URL || 'https://images.ccalc.live',
          changeOrigin: true,
        },
      },
    },
  }
})
