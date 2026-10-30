import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { desktop, isDesktop, type ShelfStatus } from '../../lib/desktop'
import { activateShelf } from '../../lib/pdf'
import { formatBytes } from '../../lib/format'
import { Button } from '../ui/primitives'
import { useToast } from '../ui/toast'

export function StorageInfo() {
  const toast = useToast()
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [shelf, setShelf] = useState<ShelfStatus | null>(null)

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
    navigator.storage?.persisted?.().then(setPersisted)
    if (isDesktop()) {
      desktop()
        ?.shelfStatus()
        .then(setShelf)
        .catch(() => {})
    }
  }, [])

  const enableShelf = async () => {
    try {
      const { status, moved } = await activateShelf()
      setShelf(status)
      toast(
        moved
          ? `Moved ${moved} book${moved === 1 ? '' : 's'} into Documents/Library`
          : 'Library folder ready in Documents/Library',
      )
    } catch {
      toast("Couldn't set up the Library folder")
    }
  }

  return (
    <div className="space-y-3 text-sm">
      {shelf?.enabled ? (
        <p className="text-muted">
          PDFs live in <span className="font-semibold text-ink break-all">{shelf.path}</span>. Highlights, notes and reading
          progress stay on this computer with the app — nothing is uploaded anywhere.
        </p>
      ) : (
        <p className="text-muted">
          Your books, highlights and notes live only on this computer. Nothing is uploaded anywhere.
        </p>
      )}
      {usage && (
        <p>
          Using <strong>{formatBytes(usage.used)}</strong>
          {usage.quota > 0 && <span className="text-muted"> of {formatBytes(usage.quota)} available</span>}
          {shelf?.enabled && <span className="text-muted"> in app storage (PDF files are in your Library folder)</span>}
        </p>
      )}
      {shelf && (
        <div className="flex flex-wrap gap-2">
          {shelf.enabled ? (
            <Button size="sm" variant="soft" onClick={() => void desktop()?.openShelf()}>
              <FolderOpen className="size-3.5" /> Open Library folder
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => void enableShelf()}>
              <FolderOpen className="size-3.5" /> Use Documents/Library
            </Button>
          )}
        </div>
      )}
      {persisted === false && (
        <div className="rounded-md bg-accent-soft p-3">
          <p className="mb-2 text-accent-strong">Browsers may clear storage when space runs low. Ask to keep your library safe:</p>
          <Button size="sm" variant="primary" onClick={() => navigator.storage.persist().then(setPersisted)}>
            Keep my library
          </Button>
        </div>
      )}
      {persisted && <p className="text-muted">✓ Protected from automatic clean-up.</p>}
    </div>
  )
}
