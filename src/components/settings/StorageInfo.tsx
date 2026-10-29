import { useEffect, useState } from 'react'
import { formatBytes } from '../../lib/format'
import { Button } from '../ui/primitives'

export function StorageInfo() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        Your books, highlights and notes live only in this browser on this computer. Nothing is uploaded anywhere.
      </p>
      {usage && (
        <p>
          Using <strong>{formatBytes(usage.used)}</strong>
          {usage.quota > 0 && <span className="text-muted"> of {formatBytes(usage.quota)} available</span>}
        </p>
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
