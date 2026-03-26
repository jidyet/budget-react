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
  console.error('Startup error:', err)
  const pre = document.createElement('pre')
  pre.style.whiteSpace = 'pre-wrap'
  pre.style.color = 'red'
  pre.style.padding = '12px'
  pre.textContent = `Startup error: ${err?.message || String(err)}`
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
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err)
      })
      return
    }

    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().catch(() => {})
      })
    }).catch(() => {})
  })
}
