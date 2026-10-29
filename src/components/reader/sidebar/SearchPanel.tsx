import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Search, X } from 'lucide-react'
import type { OcrPage } from '../../../lib/db'
import { escapeRegExp } from '../../../lib/format'
import { inputClass } from '../../ui/primitives'
import { Empty, PanelHeader, type SidebarProps } from './shared'

type SearchResult = { page: number; before: string; match: string; after: string }

const textCache = new WeakMap<PDFDocumentProxy, Map<number, string>>()

async function pageText(pdf: PDFDocumentProxy, n: number, ocr?: OcrPage) {
  if (!textCache.has(pdf)) textCache.set(pdf, new Map())
  const cache = textCache.get(pdf)!
  if (!cache.has(n)) {
    const content = await (await pdf.getPage(n)).getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? ' ' : '') : '')).join('')
    cache.set(n, text.replace(/\s+/g, ' '))
  }
  const text = cache.get(n)!
  // Scanned pages have no text of their own; use what was recognised in them.
  return ocr && text.trim().length < 25 ? ocr.text.replace(/\s+/g, ' ') : text
}

export function SearchPanel({ pdf, ocrPages, searchQuery, onSearch, onJump, currentPage, searchInputRef }: SidebarProps) {
  const [input, setInput] = useState(searchQuery)
  const [found, setFound] = useState<{ query: string; results: SearchResult[]; progress: number } | null>(null)
  const q = searchQuery.trim()
  const current = q ? (found?.query === q ? found : { query: q, results: [], progress: 0 }) : null
  const results = current?.results ?? null
  const progress = current?.progress ?? 0

  useEffect(() => {
    if (!pdf || !q) return
    let cancelled = false
    const pattern = new RegExp(escapeRegExp(q), 'gi')
    const matches: SearchResult[] = []
    ;(async () => {
      for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
        const text = await pageText(pdf, n, ocrPages.get(n))
        for (const m of text.matchAll(pattern)) {
          const start = m.index ?? 0
          matches.push({
            page: n,
            before: text.slice(Math.max(0, start - 48), start),
            match: m[0],
            after: text.slice(start + m[0].length, start + m[0].length + 64),
          })
          if (matches.length >= 500) break
        }
        const done = n === pdf.numPages || matches.length >= 500
        if (!cancelled && (n % 10 === 0 || done)) setFound({ query: q, results: [...matches], progress: done ? 1 : n / pdf.numPages })
        if (done) break
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdf, q, ocrPages])

  return (
    <div className="pb-6">
      <PanelHeader title="Search" />
      <form
        className="relative px-5"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch(input)
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-8 size-4 -translate-y-1/2 text-muted" />
        <input ref={searchInputRef} className={`${inputClass} pr-8 pl-9`} placeholder="Find in this book…" value={input} onChange={(e) => setInput(e.target.value)} />
        {input && (
          <button
            type="button"
            aria-label="Clear search"
            className="absolute top-1/2 right-7 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
            onClick={() => {
              setInput('')
              onSearch('')
            }}
          >
            <X className="size-3.5" />
          </button>
        )}
      </form>
      {results && (
        <p className="px-5 pt-3 pb-1 text-xs font-semibold text-muted">
          {progress < 1 ? `Searching… ${Math.round(progress * 100)}%` : results.length ? `${results.length}${results.length >= 500 ? '+' : ''} matches` : 'No matches'}
        </p>
      )}
      {!results && <Empty>Press Enter to search every page. Matches are marked right on the page.</Empty>}
      <ul className="px-2">
        {results?.map((r, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onJump(r.page)}
              className={`w-full rounded-md px-3 py-2 text-left text-[0.8rem] leading-relaxed hover:bg-hover ${r.page === currentPage ? 'bg-sunken' : ''}`}
            >
              <span className="mb-0.5 block text-[0.65rem] font-bold tracking-wider text-muted uppercase">Page {r.page}</span>
              <span className="text-ink/75">…{r.before}</span>
              <mark className="rounded-sm bg-accent-soft px-0.5 font-bold text-accent-strong">{r.match}</mark>
              <span className="text-ink/75">{r.after}…</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}