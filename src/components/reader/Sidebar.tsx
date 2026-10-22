import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Bookmark, BookmarkPlus, Download, Highlighter, ListTree, NotebookPen, Search, Trash2, X } from 'lucide-react'
import { HIGHLIGHT_COLORS, deleteHighlight, updateBook, type Book, type Highlight, type HighlightColor } from '../../lib/db'
import { downloadText, notesToMarkdown, safeFileName } from '../../lib/export'
import { escapeRegExp } from '../../lib/format'
import { IconButton, inputClass } from '../ui/primitives'

export type SidebarTab = 'contents' | 'search' | 'highlights' | 'bookmarks' | 'notebook'

const TABS: { id: SidebarTab; label: string; icon: ReactNode }[] = [
  { id: 'contents', label: 'Contents', icon: <ListTree /> },
  { id: 'search', label: 'Search', icon: <Search /> },
  { id: 'highlights', label: 'Highlights', icon: <Highlighter /> },
  { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark /> },
  { id: 'notebook', label: 'Notebook', icon: <NotebookPen /> },
]

type Props = {
  tab: SidebarTab
  onTab: (tab: SidebarTab) => void
  onClose: () => void
  pdf: PDFDocumentProxy | null
  book: Book
  highlights: Highlight[]
  currentPage: number
  searchQuery: string
  onSearch: (query: string) => void
  onJump: (page: number, highlightId?: string) => void
  activeHighlightId: string | null
  searchInputRef: React.RefObject<HTMLInputElement | null>
}

export function Sidebar(props: Props) {
  const { tab, onTab, onClose } = props
  return (
    <aside className="flex h-full w-80 shrink-0 animate-fade-in flex-col border-r border-line bg-surface">
      <nav className="flex items-center gap-0.5 border-b border-line px-2 py-2" aria-label="Sidebar">
        {TABS.map((t) => (
          <IconButton key={t.id} label={t.label} active={tab === t.id} onClick={() => onTab(t.id)}>
            {t.icon}
          </IconButton>
        ))}
        <IconButton label="Close sidebar" onClick={onClose} className="ml-auto">
          <X />
        </IconButton>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'contents' && <ContentsPanel {...props} />}
        {tab === 'search' && <SearchPanel {...props} />}
        {tab === 'highlights' && <HighlightsPanel {...props} />}
        {tab === 'bookmarks' && <BookmarksPanel {...props} />}
        {tab === 'notebook' && <NotebookPanel {...props} />}
      </div>
    </aside>
  )
}

function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <h3 className="font-display text-lg font-medium">{title}</h3>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm leading-relaxed text-muted">{children}</p>
}

/* ---------- Contents ---------- */

type OutlineNode = { title: string; page: number | null; children: OutlineNode[] }
type RawOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>

async function resolveOutline(pdf: PDFDocumentProxy, items: RawOutline): Promise<OutlineNode[]> {
  return Promise.all(
    (items ?? []).map(async (item) => {
      let page: number | null = null
      try {
        const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
        const ref = Array.isArray(dest) ? dest[0] : null
        if (typeof ref === 'number') page = ref + 1
        else if (ref) page = (await pdf.getPageIndex(ref)) + 1
      } catch {
        page = null
      }
      return { title: item.title, page, children: await resolveOutline(pdf, item.items) }
    }),
  )
}

function flatten(nodes: OutlineNode[], depth = 0): (OutlineNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)])
}

function ContentsPanel({ pdf, currentPage, onJump, book }: Props) {
  const [outline, setOutline] = useState<OutlineNode[] | null>(null)

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    pdf
      .getOutline()
      .then((items) => resolveOutline(pdf, items))
      .then((nodes) => !cancelled && setOutline(nodes))
      .catch(() => !cancelled && setOutline([]))
    return () => {
      cancelled = true
    }
  }, [pdf])

  const flat = useMemo(() => flatten(outline ?? []), [outline])
  const currentIdx = useMemo(() => {
    let idx = -1
    flat.forEach((n, i) => {
      if (n.page !== null && n.page <= currentPage) idx = i
    })
    return idx
  }, [flat, currentPage])

  const activeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentIdx])

  return (
    <div className="pb-6">
      <PanelHeader title="Contents" />
      {outline === null ? (
        <Empty>Reading the table of contents…</Empty>
      ) : flat.length === 0 ? (
        <>
          <Empty>This PDF doesn't include a table of contents. Bookmarks you add will show up here too.</Empty>
          <PageList book={book} currentPage={currentPage} onJump={onJump} />
        </>
      ) : (
        <ul className="px-2">
          {flat.map((n, i) => (
            <li key={i}>
              <button
                type="button"
                ref={i === currentIdx ? activeRef : undefined}
                disabled={n.page === null}
                onClick={() => n.page && onJump(n.page)}
                className={`flex w-full items-baseline gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition ${
                  i === currentIdx ? 'bg-accent-soft font-semibold text-accent-strong' : 'hover:bg-hover'
                } ${n.depth === 0 ? 'font-semibold' : 'text-ink/85'}`}
                style={{ paddingLeft: `${0.75 + n.depth * 0.9}rem` }}
              >
                <span className="flex-1">{n.title}</span>
                {n.page && <span className="text-xs text-muted tabular-nums">{n.page}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PageList({ book, currentPage, onJump }: Pick<Props, 'book' | 'currentPage' | 'onJump'>) {
  if (!book.bookmarks.length) return null
  return (
    <ul className="px-2">
      {[...book.bookmarks]
        .sort((a, b) => a.page - b.page)
        .map((b) => (
          <li key={b.page}>
            <button
              type="button"
              onClick={() => onJump(b.page)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-hover ${b.page === currentPage ? 'text-accent-strong' : ''}`}
            >
              <Bookmark className="size-3.5 text-accent" />
              <span className="flex-1 truncate">{b.label || `Page ${b.page}`}</span>
              <span className="text-xs text-muted">{b.page}</span>
            </button>
          </li>
        ))}
    </ul>
  )
}

/* ---------- Search ---------- */

type SearchResult = { page: number; before: string; match: string; after: string }

const textCache = new WeakMap<PDFDocumentProxy, Map<number, string>>()

async function pageText(pdf: PDFDocumentProxy, n: number) {
  if (!textCache.has(pdf)) textCache.set(pdf, new Map())
  const cache = textCache.get(pdf)!
  if (!cache.has(n)) {
    const content = await (await pdf.getPage(n)).getTextContent()
    const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? ' ' : '') : '')).join('')
    cache.set(n, text.replace(/\s+/g, ' '))
  }
  return cache.get(n)!
}

function SearchPanel({ pdf, searchQuery, onSearch, onJump, currentPage, searchInputRef }: Props) {
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
        const text = await pageText(pdf, n)
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
  }, [pdf, q])

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

/* ---------- Highlights ---------- */

function HighlightsPanel({ highlights, book, onJump, activeHighlightId }: Props) {
  const [color, setColor] = useState<HighlightColor | null>(null)
  const shown = color ? highlights.filter((h) => h.color === color) : highlights

  return (
    <div className="pb-6">
      <PanelHeader title="Highlights">
        <ExportButton book={book} highlights={highlights} />
      </PanelHeader>
      {highlights.length === 0 ? (
        <Empty>Select any text on a page to highlight it in one of five colours and jot a note beside it.</Empty>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-5 pb-3">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Show ${c} highlights`}
                onClick={() => setColor(color === c ? null : c)}
                className={`swatch size-5 rounded-full transition ${color === c ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-surface' : color ? 'opacity-40' : ''}`}
                data-color={c}
              />
            ))}
            <span className="ml-auto text-xs text-muted">{shown.length}</span>
          </div>
          <ul className="space-y-1 px-2">
            {shown.map((h) => (
              <li key={h.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onJump(h.page, h.id)}
                  className={`flex w-full gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-hover ${activeHighlightId === h.id ? 'bg-sunken' : ''}`}
                >
                  <span className="swatch mt-1 w-1 shrink-0 self-stretch rounded-full" data-color={h.color} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-4 font-display text-[0.85rem] leading-relaxed">{h.text}</span>
                    {h.note && <span className="mt-1.5 block text-xs leading-relaxed whitespace-pre-wrap text-muted">{h.note}</span>}
                    <span className="mt-1 block text-[0.65rem] font-bold tracking-wider text-muted/80 uppercase">Page {h.page}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete highlight"
                  onClick={() => deleteHighlight(h.id)}
                  className="absolute top-2 right-2 rounded p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:text-ink"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function ExportButton({ book, highlights }: { book: Book; highlights: Highlight[] }) {
  return (
    <IconButton label="Export notes & highlights as Markdown" onClick={() => downloadText(`${safeFileName(book.title)} — notes.md`, notesToMarkdown(book, highlights))}>
      <Download />
    </IconButton>
  )
}

/* ---------- Bookmarks ---------- */

function BookmarksPanel({ book, currentPage, onJump }: Props) {
  const marked = book.bookmarks.some((b) => b.page === currentPage)
  const sorted = [...book.bookmarks].sort((a, b) => a.page - b.page)

  const toggle = () =>
    updateBook(book.id, (b) => ({
      bookmarks: marked ? b.bookmarks.filter((x) => x.page !== currentPage) : [...b.bookmarks, { page: currentPage, label: '', createdAt: Date.now() }],
    }))

  return (
    <div className="pb-6">
      <PanelHeader title="Bookmarks">
        <IconButton label={marked ? 'Remove bookmark' : 'Bookmark this page'} onClick={toggle} active={marked}>
          <BookmarkPlus />
        </IconButton>
      </PanelHeader>
      {sorted.length === 0 ? (
        <Empty>
          Press <strong>B</strong> or the ribbon in the toolbar to tuck a bookmark into the current page.
        </Empty>
      ) : (
        <ul className="px-2">
          {sorted.map((b) => (
            <li key={b.page} className={`group flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-hover ${b.page === currentPage ? 'bg-sunken' : ''}`}>
              <button type="button" onClick={() => onJump(b.page)} className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-accent-strong tabular-nums" aria-label={`Go to page ${b.page}`}>
                <Bookmark className="size-3.5 fill-accent text-accent" />
                {b.page}
              </button>
              <input
                className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted/70 focus:bg-canvas"
                defaultValue={b.label}
                placeholder="Add a label…"
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label !== b.label) updateBook(book.id, (bk) => ({ bookmarks: bk.bookmarks.map((x) => (x.page === b.page ? { ...x, label } : x)) }))
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <button
                type="button"
                aria-label="Remove bookmark"
                onClick={() => updateBook(book.id, (bk) => ({ bookmarks: bk.bookmarks.filter((x) => x.page !== b.page) }))}
                className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-ink"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ---------- Notebook ---------- */

function NotebookPanel({ book, highlights, currentPage }: Props) {
  const [text, setText] = useState(book.notes)
  const [saved, setSaved] = useState(true)
  const ref = useRef<HTMLTextAreaElement>(null)
  const latest = useRef(text)

  useEffect(() => {
    latest.current = text
    if (text === book.notes) return
    const timer = setTimeout(() => {
      updateBook(book.id, { notes: text }).then(() => setSaved(true))
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(
    () => () => {
      if (latest.current !== book.notes) updateBook(book.id, { notes: latest.current })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const insertPageRef = () => {
    const el = ref.current
    if (!el) return
    const token = `(p. ${currentPage}) `
    const start = el.selectionStart
    setText(text.slice(0, start) + token + text.slice(el.selectionEnd))
    setSaved(false)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    })
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Notebook">
        <ExportButton book={book} highlights={highlights} />
      </PanelHeader>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          placeholder={'Thoughts, questions, summaries…\n\nTip: drop in a page reference so you can find your way back.'}
          className="min-h-0 flex-1 resize-none rounded-md border border-line bg-[repeating-linear-gradient(transparent,transparent_1.7rem,var(--color-line)_1.7rem,var(--color-line)_calc(1.7rem+1px))] bg-paper p-4 pt-[0.45rem] font-display text-[0.92rem] leading-[1.7rem] text-ink outline-none placeholder:text-muted/70 focus:border-accent"
          style={{ backgroundAttachment: 'local' }}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <button type="button" onClick={insertPageRef} className="rounded-md px-2 py-1 font-semibold text-accent-strong hover:bg-accent-soft">
            + Page {currentPage} reference
          </button>
          <span>
            {words} words · {saved ? 'saved' : 'saving…'}
          </span>
        </div>
      </div>
    </div>
  )
}
