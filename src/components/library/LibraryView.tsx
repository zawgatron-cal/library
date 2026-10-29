import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, Plus, Search, Settings2, Upload } from 'lucide-react'
import type { Book } from '../../lib/db'
import { useBooks, useHighlightCounts, useHighlights } from '../../lib/hooks'
import { bookProgress, displayPage, formatRelative } from '../../lib/format'
import { importPdf, isPdf, openFailure } from '../../lib/pdf'
import { Wordmark } from '../ui/Logo'
import { Button, IconButton } from '../ui/primitives'
import { useToast } from '../ui/toast'
import { usePasswordPrompt } from '../ui/usePasswordPrompt'
import { BookCard } from './BookCard'
import { BookCover } from './BookCover'
import { openBook, screenReady } from '../../lib/router'
import { BookDetailsSheet } from './BookDetails'
import { DeleteBookDialog } from './DeleteBookDialog'

type Filter = 'all' | 'reading' | 'unread' | 'finished' | 'favorites' | 'archived'
type Sort = 'opened' | 'added' | 'title' | 'author' | 'progress'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'unread', label: 'Up next' },
  { value: 'finished', label: 'Finished' },
  { value: 'favorites', label: 'Favourites' },
]

function statusOf(book: Book): Exclude<Filter, 'all' | 'favorites' | 'archived'> {
  if (book.finishedAt) return 'finished'
  if (book.openedAt) return 'reading'
  return 'unread'
}

const SORTERS: Record<Sort, (a: Book, b: Book) => number> = {
  opened: (a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt),
  added: (a, b) => b.addedAt - a.addedAt,
  title: (a, b) => a.title.localeCompare(b.title),
  author: (a, b) => (a.author || '~').localeCompare(b.author || '~'),
  progress: (a, b) => bookProgress(b) - bookProgress(a),
}

const CARD_MIN = 152
const GAP_X = 28

export function LibraryView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const books = useBooks()
  const annotationCounts = useHighlightCounts()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('opened')
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Book | null>(null)
  const dragging = useFileDrag(handleFiles)
  const [askPassword, passwordDialog] = usePasswordPrompt()

  async function handleFiles(files: File[]) {
    const checks = await Promise.all(files.map(isPdf))
    const pdfs = files.filter((_, i) => checks[i])
    if (!pdfs.length) {
      if (files.length) toast('Library only reads PDFs for now')
      return
    }
    setImporting((n) => n + pdfs.length)
    for (const file of pdfs) {
      try {
        const book = await importPdf(file, askPassword)
        toast(`Added “${book.title}”`)
      } catch (err) {
        const reason = openFailure(err)
        if (reason) {
          console.error(err)
          toast(`Couldn't add ${file.name}: ${reason}`)
        }
      } finally {
        setImporting((n) => n - 1)
      }
    }
  }

  const addBooks = () => fileInput.current?.click()
  const allTags = useMemo(() => [...new Set((books ?? []).flatMap((b) => b.tags))].sort(), [books])

  const shelved = useMemo(() => (books ?? []).filter((b) => !b.archivedAt), [books])
  const archivedCount = (books?.length ?? 0) - shelved.length
  // Leave the archive view once the last book in it is restored.
  const activeFilter = filter === 'archived' && archivedCount === 0 ? 'all' : filter

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = activeFilter === 'archived' ? (books ?? []).filter((b) => b.archivedAt) : shelved
    return pool
      .filter((b) => activeFilter === 'all' || activeFilter === 'archived' || (activeFilter === 'favorites' ? b.favorite : statusOf(b) === activeFilter))
      .filter((b) => !tag || b.tags.includes(tag))
      .filter((b) => !q || `${b.title} ${b.author} ${b.tags.join(' ')} ${b.fileName}`.toLowerCase().includes(q))
      .sort(SORTERS[sort])
  }, [books, shelved, query, activeFilter, tag, sort])

  const current = useMemo(() => shelved.filter((b) => b.openedAt && !b.finishedAt).sort((a, b) => b.openedAt! - a.openedAt!)[0], [shelved])
  const detailsBook = books?.find((b) => b.id === detailsId)
  const filtered = activeFilter !== 'all' || !!tag || !!query.trim()

  return (
    <div className="relative flex h-full animate-fade-in flex-col">
      <header className="shrink-0 px-6 pt-5 pb-0 sm:px-10">
        <div className="flex items-end gap-4 pb-4">
          <Wordmark />
          <div className="relative mx-auto hidden w-full max-w-sm md:block">
            <Search className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted" />
            <input
              className="w-full border-0 border-b border-ink/30 bg-transparent py-2 pl-7 text-sm text-ink outline-none placeholder:text-muted/70 focus:border-ink"
              placeholder="Search your library"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {importing > 0 && <span className="mr-2 animate-pulse text-xs font-semibold text-muted">Adding {importing}…</span>}
            <Button variant="ghost" size="sm" onClick={addBooks} className="font-display italic">
              <Plus className="size-3.5" /> Add
            </Button>
            <IconButton label="Appearance & settings" onClick={onOpenSettings}>
              <Settings2 />
            </IconButton>
          </div>
        </div>
        <div className="masthead-rule" aria-hidden />
        <input
          ref={fileInput}
          type="file"
          accept=".pdf"
          multiple
          hidden
          onChange={(e) => {
            handleFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-20 sm:px-10">
        {books === undefined ? null : (
          <div className="mx-auto max-w-6xl">
            {current && <ContinueCard book={current} />}

            {books.length > 0 && (
              <div className="sticky top-0 z-10 mb-8 flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-ink/20 bg-canvas pt-2 pb-2">
                <div className="relative w-full md:hidden">
                  <Search className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted" />
                  <input
                    className="w-full border-0 border-b border-ink/30 bg-transparent py-2 pl-7 text-sm outline-none placeholder:text-muted/70 focus:border-ink"
                    placeholder="Search your library"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                {FILTERS.map((f) => (
                  <Chip key={f.value} active={activeFilter === f.value} onClick={() => setFilter(f.value)}>
                    {f.label}
                  </Chip>
                ))}
                {archivedCount > 0 && (
                  <Chip active={activeFilter === 'archived'} onClick={() => setFilter(activeFilter === 'archived' ? 'all' : 'archived')}>
                    Archived · {archivedCount}
                  </Chip>
                )}
                {allTags.length > 0 && <span className="mb-1 text-muted/40" aria-hidden>|</span>}
                {allTags.map((t) => (
                  <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {t}
                  </Chip>
                ))}
                <span className="ml-auto mb-1 font-display text-xs text-muted italic">
                  {visible.length} of {activeFilter === 'archived' ? archivedCount : shelved.length}
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="mb-0.5 border-0 border-b border-ink/30 bg-transparent py-1 pr-1 text-xs font-semibold tracking-wide text-ink uppercase outline-none"
                  aria-label="Sort by"
                >
                  <option value="opened">Recently read</option>
                  <option value="added">Recently added</option>
                  <option value="title">Title</option>
                  <option value="author">Author</option>
                  <option value="progress">Progress</option>
                </select>
              </div>
            )}

            {books.length > 0 && (
              <p className="ornament-label mb-6">
                <span>On the shelves</span>
              </p>
            )}

            <Shelves>
              {[
                ...(filtered ? [] : [<AddTile key="add" onClick={addBooks} busy={importing > 0} />]),
                ...visible.map((book) => (
                  <BookCard
                    key={book.id}
                    book={book}
                    annotationCount={annotationCounts[book.id] ?? 0}
                    onDetails={() => setDetailsId(book.id)}
                    onDelete={() => setDeleting(book)}
                  />
                )),
              ]}
            </Shelves>

            {books.length === 0 && (
              <p className="mx-auto mt-4 max-w-md text-center text-sm leading-relaxed text-muted">
                Add PDFs of books, papers or course readers. They're kept on this computer — private, offline, and right where you left them.
              </p>
            )}
            {books.length > 0 && filtered && visible.length === 0 && <p className="py-10 text-center text-muted">Nothing on this shelf.</p>}
            {activeFilter === 'archived' && visible.length > 0 && (
              <p className="mt-2 text-center text-sm text-muted">Archived books are kept, with all their annotations, but stay off your shelves until you bring them back.</p>
            )}
          </div>
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-[color-mix(in_oklab,var(--canvas)_88%,transparent)] p-8">
          <div className="flex size-full max-w-3xl flex-col items-center justify-center rounded-md border-2 border-dashed border-ink bg-surface text-ink">
            <Upload className="mb-3 size-10" />
            <p className="font-display text-2xl">Drop to add to your library</p>
          </div>
        </div>
      )}

      {detailsBook && (
        <BookDetailsSheet
          key={detailsBook.id}
          book={detailsBook}
          annotationCount={annotationCounts[detailsBook.id] ?? 0}
          onClose={() => setDetailsId(null)}
          onDelete={() => {
            setDetailsId(null)
            setDeleting(detailsBook)
          }}
        />
      )}
      {deleting && <DeleteBookDialog book={deleting} onClose={() => setDeleting(null)} />}
      {passwordDialog}
    </div>
  )
}

/** Lays books out in rows, each resting on its own shelf. */
function Shelves({ children }: { children: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  // Measured synchronously too, since resize observers don't fire while a screen transition is preparing.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.clientWidth)
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (width > 0) screenReady('library')
  }, [width])

  const cols = Math.max(2, Math.floor((width + GAP_X) / (CARD_MIN + GAP_X)))
  const cardW = width ? (width - GAP_X * (cols - 1)) / cols : CARD_MIN
  const rows: ReactNode[][] = []
  for (let i = 0; i < children.length; i += cols) rows.push(children.slice(i, i + cols))

  return (
    <div ref={ref} className="space-y-10">
      {width > 0 &&
        rows.map((row, i) => (
          <div key={i} className="relative animate-rise" style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
            <div className="shelf-plank" style={{ top: cardW * 1.5 }} />
            <div className="relative grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, columnGap: GAP_X }}>
              {row}
            </div>
          </div>
        ))}
    </div>
  )
}

function AddTile({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className="folio-empty group/add flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 text-muted transition hover:text-ink"
      >
        <Plus className={`size-6 ${busy ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        <span className="font-display text-lg italic">Add books</span>
        <span className="px-4 text-center text-[0.7rem] leading-snug tracking-wide uppercase">or drop PDFs anywhere</span>
      </button>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-active={active} className="section-chip">
      {children}
    </button>
  )
}

function ContinueCard({ book }: { book: Book }) {
  const progress = bookProgress(book)
  const page = displayPage(book.position, book.pageCount)
  const highlights = useHighlights(book.id)
  const latest = useMemo(() => [...highlights].sort((a, b) => b.createdAt - a.createdAt)[0], [highlights])
  const open = (el: Element | null) => openBook(book.id, el)

  return (
    <section className="animate-rise mt-6 mb-12">
      <div className="rule-double" aria-hidden />
      <div className="flex flex-col gap-6 py-7 sm:flex-row sm:items-stretch sm:gap-9 sm:py-9">
        <button type="button" className="cover-frame w-28 shrink-0 self-start sm:w-32" onClick={(e) => open(e.currentTarget)} aria-label={`Continue ${book.title}`}>
          <BookCover book={book} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <p className="ornament-label justify-start">
            <span>
              Where you left off · p. {page} of {book.pageCount}
            </span>
          </p>
          <h2 className="mt-3 font-display text-[2rem] leading-[1.05] font-medium tracking-tight text-balance sm:text-[2.55rem]">
            <button type="button" className="text-left hover:underline decoration-1 underline-offset-4" onClick={(e) => open(e.currentTarget)}>
              {book.title}
            </button>
          </h2>
          <p className="byline mt-2 font-display text-base text-muted italic">
            {book.author || 'Unknown author'}
            <span className="mx-2 text-ink/25" aria-hidden>
              ◆
            </span>
            {formatRelative(book.openedAt!)}
            {progress > 0 && progress < 1 && (
              <>
                <span className="mx-2 text-ink/25" aria-hidden>
                  ◆
                </span>
                {Math.round(progress * 100)}% read
              </>
            )}
          </p>
          {latest && <blockquote className="pull-quote line-clamp-3 max-w-2xl">{latest.note || `“${latest.text}”`}</blockquote>}
          <button type="button" className="continue-link self-start" onClick={(e) => open(e.currentTarget.closest('section'))}>
            Continue reading <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="rule-double" aria-hidden />
    </section>
  )
}

function useFileDrag(onFiles: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false)
  const handler = useRef(onFiles)
  useEffect(() => {
    handler.current = onFiles
  })

  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      handler.current([...(e.dataTransfer?.files ?? [])])
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [])

  return dragging
}
