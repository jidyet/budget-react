import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const packageVersion = String(packageJson.version || 'dev')
const buildStamp = new Date().toISOString().slice(0, 10)
// BETA-1: best-effort short commit hash for build-provenance identification
// (e.g. a Settings-page "Beta - 4715497" label so a tester/support engineer
// can identify exactly which release candidate is running). Never fails the
// build - a shallow checkout or an environment with no .git history simply
// gets an empty string, same as any other missing build metadata.
let gitCommit = ''
try {
  gitCommit = execSync('git rev-parse --short HEAD', { cwd: new URL('.', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
} catch {
  gitCommit = ''
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageVersion),
    __APP_BUILD__: JSON.stringify(buildStamp),
    __APP_COMMIT__: JSON.stringify(gitCommit),
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
