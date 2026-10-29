import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Archive, ArrowRight, Plus, Search, Settings2, Upload } from 'lucide-react'
import type { Book } from '../../lib/db'
import { useBooks, useHighlightCounts, useHighlights } from '../../lib/hooks'
import { bookProgress, displayPage, formatRelative } from '../../lib/format'
import { importPdf, isPdf, openFailure } from '../../lib/pdf'
import { CornerVines, LabelFlourish, OpenBookArt, VineFlourish } from '../ui/Flourishes'
import { Wordmark } from '../ui/Logo'
import { Button, IconButton, inputClass } from '../ui/primitives'
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
      <div className="ambient-wash" aria-hidden />
      <CornerVines className="absolute top-0 left-0 z-[1] h-36 w-36 opacity-70" />
      <CornerVines className="absolute top-0 right-0 z-[1] h-36 w-36 -scale-x-100 opacity-70" />

      <header className="relative z-[1] flex shrink-0 items-center gap-4 px-6 py-5 sm:px-10">
        <Wordmark />
        <div className="relative mx-auto hidden w-full max-w-sm md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input className={`${inputClass} rounded-full bg-surface/80 pl-10 shadow-soft`} placeholder="Search your library" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {importing > 0 && <span className="mr-2 animate-pulse text-xs font-semibold text-muted">Adding {importing}…</span>}
          <Button variant="soft" size="sm" onClick={addBooks} className="rounded-full">
            <Plus className="size-3.5" /> Add
          </Button>
          <IconButton label="Appearance & settings" onClick={onOpenSettings}>
            <Settings2 />
          </IconButton>
        </div>
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

      <main className="relative z-[1] flex-1 overflow-y-auto px-6 pb-20 sm:px-10">
        {books === undefined ? null : (
          <div className="mx-auto max-w-6xl">
            {current && <ContinueCard book={current} />}

            {books.length > 0 && (
              <div className="sticky top-0 z-10 -mx-2 mb-8 flex flex-wrap items-center gap-2 bg-canvas/70 px-2 py-3 backdrop-blur-md">
                <div className="relative w-full md:hidden">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                  <input className={`${inputClass} rounded-full bg-surface pl-9`} placeholder="Search your library" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {FILTERS.map((f) => (
                  <Chip key={f.value} active={activeFilter === f.value} onClick={() => setFilter(f.value)}>
                    {f.label}
                  </Chip>
                ))}
                {archivedCount > 0 && (
                  <Chip active={activeFilter === 'archived'} onClick={() => setFilter(activeFilter === 'archived' ? 'all' : 'archived')}>
                    <Archive className="-mt-px mr-1 inline size-3" />
                    Archived · {archivedCount}
                  </Chip>
                )}
                {allTags.length > 0 && <span className="mx-1 h-5 w-px bg-line-strong" />}
                {allTags.map((t) => (
                  <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    # {t}
                  </Chip>
                ))}
                <span className="ml-auto text-xs text-muted">
                  {visible.length} of {activeFilter === 'archived' ? archivedCount : shelved.length}
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink outline-none"
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
              <div className="mx-auto mt-6 flex max-w-md flex-col items-center text-center">
                <OpenBookArt className="mb-4 h-32 w-44 text-flourish" />
                <p className="font-display text-xl text-ink/80 italic">Your shelves are waiting</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Add PDFs of books, papers or course readers. They're kept on this computer — private, offline, and right where you left them.
                </p>
              </div>
            )}
            {books.length > 0 && filtered && visible.length === 0 && (
              <div className="flex flex-col items-center py-12 text-muted">
                <VineFlourish className="h-4 w-28 text-flourish/70" />
                <p className="mt-3">Nothing on this shelf.</p>
              </div>
            )}
            {activeFilter === 'archived' && visible.length > 0 && (
              <p className="mt-2 text-center text-sm text-muted">Archived books are kept, with all their annotations, but stay off your shelves until you bring them back.</p>
            )}
          </div>
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-[color-mix(in_oklab,var(--canvas)_75%,transparent)] p-8 backdrop-blur-sm">
          <div className="flex size-full max-w-3xl flex-col items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/60 text-accent-strong">
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
        className="group/add flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-[calc(var(--radius-lg))] border-2 border-dashed border-flourish/35 bg-surface/35 text-muted transition duration-300 ease-out hover:-translate-y-1.5 hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent-strong"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-surface/90 shadow-soft transition group-hover/add:scale-105">
          <Plus className={`size-5 ${busy ? 'animate-spin' : ''}`} />
        </span>
        <span className="font-display text-base font-medium italic">Add books</span>
        <span className="px-4 text-center text-[0.7rem] leading-snug">or drop PDFs anywhere</span>
      </button>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
        active ? 'bg-accent-soft text-accent-strong shadow-soft' : 'text-muted hover:bg-hover hover:text-ink'
      }`}
    >
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
    <section className="continue-glow animate-rise mt-2 mb-12">
      <LabelFlourish>Where you left off</LabelFlourish>
      <div className="mt-5 flex flex-col gap-6 sm:flex-row sm:items-end sm:gap-8">
        <button
          type="button"
          className="w-24 shrink-0 transition duration-300 ease-out hover:-translate-y-1 sm:w-28"
          onClick={(e) => open(e.currentTarget)}
          aria-label={`Continue ${book.title}`}
        >
          <BookCover book={book} className="shadow-lifted" />
        </button>
        <div className="min-w-0 flex-1 sm:pb-1">
          <h2 className="font-display text-3xl leading-tight font-medium text-balance sm:text-[2.15rem]">
            <button type="button" className="text-left transition hover:text-accent-strong" onClick={(e) => open(e.currentTarget)}>
              {book.title}
            </button>
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {book.author || 'Unknown author'} · {formatRelative(book.openedAt!)} · p. {page} of {book.pageCount}
          </p>
          {latest && (
            <p className="mt-4 line-clamp-2 max-w-2xl font-display text-[0.95rem] leading-relaxed text-ink/75 italic">
              {latest.note || `“${latest.text}”`}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <div className="h-1.5 min-w-[8rem] flex-1 overflow-hidden rounded-full bg-line sm:max-w-xs">
              <div className="h-full rounded-full bg-flourish" style={{ width: `${Math.max(progress * 100, 2)}%` }} />
            </div>
            <Button variant="primary" className="rounded-full" onClick={(e) => open(e.currentTarget.closest('section'))}>
              Continue <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
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
