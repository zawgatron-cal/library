import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/eb-garamond/wght.css'
import '@fontsource-variable/eb-garamond/wght-italic.css'
import '@fontsource-variable/nunito/index.css'
import '@fontsource-variable/literata/index.css'
import '@fontsource/atkinson-hyperlegible/400.css'
import '@fontsource/atkinson-hyperlegible/700.css'
import './index.css'
import App from './App.tsx'
import { startOcrQueue } from './lib/ocr'

// Pinching a trackpad would otherwise zoom the whole window (pushing the toolbar and menus off-screen with no way
// to pan back). The reader handles pinches over the pages itself; everywhere else they're ignored.
window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false })
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (e) => e.preventDefault(), { passive: false })

startOcrQueue()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
