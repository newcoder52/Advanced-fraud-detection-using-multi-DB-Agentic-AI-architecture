import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'https://nkt0mgbdn5.execute-api.us-east-1.amazonaws.com/v1',
        changeOrigin: true,
      },
    },
  },
})
