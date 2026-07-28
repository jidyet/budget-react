import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const packageVersion = String(packageJson.version || 'dev')
const buildStamp = new Date().toISOString().slice(0, 10)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
    __APP_BUILD__: JSON.stringify(buildStamp),
  },
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
