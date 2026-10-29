import { Pause, ScanText } from 'lucide-react'
import type { OcrProgress } from '../../lib/ocr'

export function OcrPill({ progress, onPause }: { progress?: OcrProgress; onPause: () => void }) {
  const fraction = progress?.total ? progress.done / progress.total : 0
  return (
    <div className="absolute bottom-5 left-5 z-20 flex w-60 animate-rise flex-col gap-2 rounded-xl border border-line bg-surface px-3.5 py-3 shadow-soft">
      <div className="flex items-center gap-2 text-xs">
        <ScanText className="size-3.5 shrink-0 animate-pulse text-accent" />
        <span className="flex-1 font-semibold">
          Recognising text
          {progress?.total ? (
            <span className="font-normal text-muted">
              {' '}
              · {progress.done} of {progress.total} pages
            </span>
          ) : (
            <span className="font-normal text-muted"> · getting ready</span>
          )}
        </span>
        <button type="button" onClick={onPause} className="rounded p-0.5 text-muted hover:text-ink" aria-label="Pause text recognition" title="Pause">
          <Pause className="size-3.5" />
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(3, fraction * 100)}%` }} />
      </div>
    </div>
  )
}
