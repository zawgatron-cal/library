import { useState } from 'react'
import { LibraryView } from './components/library/LibraryView'
import { ReaderView } from './components/reader/ReaderView'
import { SettingsSheet } from './components/settings/SettingsSheet'
import { ToastProvider } from './components/ui/toast'
import { useRoute } from './lib/router'
import { SettingsProvider } from './lib/settings'

export default function App() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </SettingsProvider>
  )
}

function Shell() {
  const route = useRoute()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = () => setSettingsOpen(true)

  return (
    <>
      {route.view === 'reader' ? <ReaderView bookId={route.bookId} onOpenSettings={openSettings} /> : <LibraryView onOpenSettings={openSettings} />}
      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} bookId={route.view === 'reader' ? route.bookId : undefined} />
      )}
    </>
  )
}
