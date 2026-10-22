import { useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { Dialog, inputClass } from '../ui/primitives'

type Candidate = { page: number; title: string; detail: string }

function candidatesFor(query: string, pageCount: number, labels: string[] | null): Candidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: Candidate[] = []
  const add = (c: Candidate) => {
    if (c.page >= 1 && c.page <= pageCount && !out.some((x) => x.page === c.page)) out.push(c)
  }

  if (labels) {
    const idx = labels.findIndex((l) => l.toLowerCase() === q)
    if (idx >= 0) add({ page: idx + 1, title: `Printed page ${labels[idx]}`, detail: `PDF page ${idx + 1}` })
  }
  const pct = q.match(/^(\d+(?:\.\d+)?)\s*%$/)
  if (pct) {
    const page = Math.max(1, Math.round((Number(pct[1]) / 100) * pageCount))
    add({ page, title: `${pct[1]}% through`, detail: `PDF page ${page}` })
  }
  if (/^\d+$/.test(q)) {
    const n = Number(q)
    add({ page: n, title: `PDF page ${n}`, detail: labels?.[n - 1] && labels[n - 1] !== String(n) ? `printed ${labels[n - 1]}` : `of ${pageCount}` })
  }
  return out
}

export function GoToDialog({
  pageCount,
  currentPage,
  labels,
  onGo,
  onClose,
}: {
  pageCount: number
  currentPage: number
  labels: string[] | null
  onGo: (page: number) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const candidates = candidatesFor(query, pageCount, labels)
  const hasPrinted = !!labels?.some((l, i) => l !== String(i + 1))

  const go = (c?: Candidate) => {
    if (!c) return
    onGo(c.page)
    onClose()
  }

  return (
    <Dialog title="Go to page" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(candidates[selected] ?? candidates[0])
        }}
      >
        <input
          autoFocus
          className={`${inputClass} py-2.5 text-base`}
          placeholder={hasPrinted ? `Page number, printed page (e.g. ${labels?.[Math.min(4, pageCount - 1)]}), or %` : `1 – ${pageCount}, or a percentage`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSelected(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(candidates.length - 1, s + 1))
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(0, s - 1))
            }
          }}
        />
      </form>
      <ul className="mt-3 min-h-24 space-y-1">
        {candidates.map((c, i) => (
          <li key={c.page}>
            <button
              type="button"
              onClick={() => go(c)}
              onMouseEnter={() => setSelected(i)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${i === selected ? 'bg-accent-soft text-accent-strong' : 'hover:bg-hover'}`}
            >
              <span className="font-semibold">{c.title}</span>
              <span className="flex items-center gap-2 text-xs text-muted">
                {c.detail}
                {i === selected && <CornerDownLeft className="size-3.5" />}
              </span>
            </button>
          </li>
        ))}
        {query.trim() && candidates.length === 0 && <li className="px-3 py-2 text-sm text-muted">No page matches “{query}”.</li>}
        {!query.trim() && (
          <li className="px-3 py-2 text-sm text-muted">
            You're on page {currentPage}
            {labels?.[currentPage - 1] && labels[currentPage - 1] !== String(currentPage) ? ` (printed ${labels[currentPage - 1]})` : ''} of {pageCount}.
          </li>
        )}
      </ul>
    </Dialog>
  )
}
