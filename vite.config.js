import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Ensure assets use relative paths for Capacitor WebView
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/pdfjs-dist')) return 'pdfjs'
          if (id.includes('node_modules/xlsx')) return 'xlsx'
          if (id.includes('node_modules/tesseract.js')) return 'ocr'
          if (id.includes('node_modules')) return 'vendor'
          return undefined
        },
      },
    },
  },
})
