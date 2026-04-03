import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/syne/700.css'
import '@fontsource/syne/800.css'
import '@fontsource/dm-mono/400.css'
import '@fontsource/dm-mono/500.css'
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/instrument-sans/700.css'
import './index.css'
import AppErrorBoundary from './components/ui/AppErrorBoundary.jsx'

function showStartupError(err) {
  const message = err?.message || String(err)
  const stack = typeof err?.stack === "string" ? err.stack : ""
  const fingerprint = `${message}\n${stack}`
  window.__startupErrorCache = window.__startupErrorCache || new Set()
  if (window.__startupErrorCache.has(fingerprint)) return
  window.__startupErrorCache.add(fingerprint)

  console.error('Startup error:', err)
  const pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.color = 'red'
  pre.style.padding = '12px'
  pre.textContent = `Startup error: ${message}${stack ? `\n${stack}` : ""}`
  document.body.appendChild(pre)
}

window.addEventListener('error', (e) => {
  showStartupError(e.error || e.message)
})

window.addEventListener('unhandledrejection', (e) => {
  showStartupError(e.reason)
})

async function start() {
  try {
    const { default: App } = await import('./App.jsx')
    const rootEl = document.getElementById('root')
    if (!rootEl) throw new Error('Root element not found')

    createRoot(rootEl).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>
    )
  } catch (e) {
    showStartupError(e)
  }
}

start()

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const register = navigator.serviceWorker && typeof navigator.serviceWorker.register === "function"
      ? navigator.serviceWorker.register.bind(navigator.serviceWorker)
      : null

    if (!register) return

    register("/sw.js").catch((error) => {
      console.error("service worker registration error", error)
    })
  })
}
