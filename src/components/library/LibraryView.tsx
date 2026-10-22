import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Flame, Plus, Search, Settings2, Upload } from 'lucide-react'
import type { Book } from '../../lib/db'
import { useBooks, useHighlightCounts } from '../../lib/hooks'
import { bookProgress, displayPage, formatDuration, formatRelative, greeting } from '../../lib/format'
import { importPdf, isPdf } from '../../lib/pdf'
import { useReadingLog } from '../../lib/readingLog'
import { navigate } from '../../lib/router'
import { useSettings } from '../../lib/settings'
import { Wordmark } from '../ui/Logo'
import { Button, IconButton, inputClass } from '../ui/primitives'
import { useToast } from '../ui/toast'
import { BookCard } from './BookCard'
import { BookCover } from './BookCover'
import { DeleteBookDialog, EditBookDialog } from './EditBookDialog'

type Filter = 'all' | 'reading' | 'unread' | 'finished' | 'favorites'
type Sort = 'opened' | 'added' | 'title' | 'author' | 'progress'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'unread', label: 'Up next' },
  { value: 'finished', label: 'Finished' },
  { value: 'favorites', label: 'Favourites' },
]

function statusOf(book: Book): Exclude<Filter, 'all' | 'favorites'> {
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

export function LibraryView({ onOpenSettings }: { onOpenSettings: () => void }) {
  const books = useBooks()
  const highlightCounts = useHighlightCounts()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(0)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [tag, setTag] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('opened')
  const [editing, setEditing] = useState<Book | null>(null)
  const [deleting, setDeleting] = useState<Book | null>(null)
  const dragging = useFileDrag(handleFiles)

  async function handleFiles(files: File[]) {
    const pdfs = files.filter(isPdf)
    if (!pdfs.length) {
      if (files.length) toast('Library only reads PDFs for now')
      return
    }
    setImporting((n) => n + pdfs.length)
    for (const file of pdfs) {
      try {
        const book = await importPdf(file)
        toast(`Shelved “${book.title}”`)
      } catch (err) {
        console.error(err)
        toast(`Couldn't open ${file.name}`)
      } finally {
        setImporting((n) => n - 1)
      }
    }
  }

  const allTags = useMemo(() => [...new Set((books ?? []).flatMap((b) => b.tags))].sort(), [books])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (books ?? [])
      .filter((b) => filter === 'all' || (filter === 'favorites' ? b.favorite : statusOf(b) === filter))
      .filter((b) => !tag || b.tags.includes(tag))
      .filter((b) => !q || `${b.title} ${b.author} ${b.tags.join(' ')} ${b.fileName}`.toLowerCase().includes(q))
      .sort(SORTERS[sort])
  }, [books, query, filter, tag, sort])

  const current = useMemo(
    () => (books ?? []).filter((b) => b.openedAt && !b.finishedAt).sort((a, b) => b.openedAt! - a.openedAt!)[0],
    [books],
  )

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-4 px-6 py-4 sm:px-10">
        <Wordmark />
        <div className="relative mx-auto hidden w-full max-w-sm md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className={`${inputClass} rounded-full bg-surface pl-9`} placeholder="Search your shelves" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          {importing > 0 && <span className="mr-2 animate-pulse text-xs font-semibold text-muted">Shelving {importing}…</span>}
          <Button variant="primary" onClick={() => fileInput.current?.click()}>
            <Plus className="size-4" /> Add books
          </Button>
          <IconButton label="Appearance & settings" onClick={onOpenSettings}>
            <Settings2 />
          </IconButton>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            handleFiles([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-16 sm:px-10">
        {books === undefined ? null : books.length === 0 ? (
          <EmptyShelf onAdd={() => fileInput.current?.click()} />
        ) : (
          <div className="mx-auto max-w-6xl">
            <section className="grid gap-5 pt-4 pb-8 lg:grid-cols-[1fr_auto]">
              <div className="flex flex-col justify-end">
                <h1 className="font-display text-4xl font-normal tracking-tight sm:text-5xl">{greeting()}.</h1>
                <p className="mt-2 text-muted">
                  {books.length} {books.length === 1 ? 'book' : 'books'} on your shelves
                  {current ? ' — pick up where you left off?' : ' — what shall we read today?'}
                </p>
              </div>
              <GoalCard />
            </section>

            {current && <ContinueCard book={current} />}

            <div className="sticky top-0 z-10 -mx-2 mb-6 flex flex-wrap items-center gap-2 bg-canvas/85 px-2 py-3 backdrop-blur-md">
              <div className="relative w-full md:hidden">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input className={`${inputClass} rounded-full bg-surface pl-9`} placeholder="Search your shelves" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              {FILTERS.map((f) => (
                <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
                  {f.label}
                </Chip>
              ))}
              {allTags.length > 0 && <span className="mx-1 h-5 w-px bg-line-strong" />}
              {allTags.map((t) => (
                <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                  # {t}
                </Chip>
              ))}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink outline-none"
                aria-label="Sort by"
              >
                <option value="opened">Recently read</option>
                <option value="added">Recently added</option>
                <option value="title">Title</option>
                <option value="author">Author</option>
                <option value="progress">Progress</option>
              </select>
            </div>

            {visible.length ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-6 gap-y-9">
                {visible.map((book) => (
                  <BookCard key={book.id} book={book} highlightCount={highlightCounts[book.id] ?? 0} onEdit={() => setEditing(book)} onDelete={() => setDeleting(book)} />
                ))}
              </div>
            ) : (
              <p className="py-16 text-center text-muted">Nothing on this shelf yet.</p>
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

      {editing && <EditBookDialog book={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteBookDialog book={deleting} onClose={() => setDeleting(null)} />}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${active ? 'bg-ink text-canvas' : 'bg-surface text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function ContinueCard({ book }: { book: Book }) {
  const progress = bookProgress(book)
  const page = displayPage(book.position, book.pageCount)
  return (
    <section className="mb-10 flex animate-rise items-center gap-6 rounded-xl border border-line bg-surface p-5 shadow-soft sm:p-6">
      <button type="button" className="w-20 shrink-0 sm:w-24" onClick={() => navigate({ view: 'reader', bookId: book.id })} aria-label={`Continue ${book.title}`}>
        <BookCover book={book} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold tracking-wider text-accent uppercase">Continue reading</p>
        <h2 className="mt-1 truncate font-display text-2xl font-medium">{book.title}</h2>
        <p className="truncate text-sm text-muted">
          {book.author || 'Unknown author'} · opened {formatRelative(book.openedAt!)}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 max-w-xs flex-1 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(progress * 100, 2)}%` }} />
          </div>
          <span className="text-xs font-semibold text-muted tabular-nums">
            p. {page} of {book.pageCount}
          </span>
        </div>
      </div>
      <Button variant="primary" className="hidden sm:inline-flex" onClick={() => navigate({ view: 'reader', bookId: book.id })}>
        Continue <ArrowRight className="size-4" />
      </Button>
    </section>
  )
}

function GoalCard() {
  const { settings } = useSettings()
  const { today, streak, week } = useReadingLog()
  const goal = settings.dailyGoalMinutes * 60
  const pct = Math.min(1, today / goal)
  const max = Math.max(goal, ...week.map((d) => d.seconds))
  const r = 26
  const circumference = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-5 rounded-xl border border-line bg-surface px-5 py-4 shadow-soft">
      <div className="relative size-16 shrink-0">
        <svg viewBox="0 0 64 64" className="size-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            opacity={pct > 0 ? 1 : 0}
            className="transition-[stroke-dashoffset] duration-700"
          />
        </svg>
        <BookOpen className="absolute inset-0 m-auto size-5 text-accent" />
      </div>
      <div>
        <p className="text-sm font-bold">{today < 60 ? 'No reading yet today' : `${formatDuration(today)} today`}</p>
        <p className="text-xs text-muted">
          {pct >= 1 ? 'Goal reached — lovely.' : `Goal: ${settings.dailyGoalMinutes} min`}
          {streak > 1 && (
            <span className="ml-2 inline-flex items-center gap-0.5 font-semibold text-accent-strong">
              <Flame className="size-3" /> {streak}-day streak
            </span>
          )}
        </p>
        <div className="mt-2 flex h-6 items-end gap-1" aria-label="Reading this week">
          {week.map((d, i) => (
            <div key={d.key} className="flex flex-col items-center gap-0.5" title={`${formatDuration(d.seconds)}`}>
              <div
                className={`w-3 rounded-sm ${i === week.length - 1 ? 'bg-accent' : 'bg-[color-mix(in_oklab,var(--accent)_40%,var(--color-line))]'}`}
                style={{ height: `${Math.max(2, (d.seconds / max) * 16)}px` }}
              />
              <span className="text-[0.55rem] leading-none font-bold text-muted">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyShelf({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg animate-rise flex-col items-center py-16 text-center sm:py-24">
      <svg viewBox="0 0 220 120" className="mb-8 w-64" aria-hidden="true">
        <rect x="10" y="108" width="200" height="6" rx="3" fill="var(--color-line-strong)" />
        <rect x="38" y="40" width="22" height="68" rx="3" fill="var(--accent)" opacity="0.85" />
        <rect x="62" y="28" width="18" height="80" rx="3" fill="var(--color-line-strong)" />
        <rect x="82" y="48" width="26" height="60" rx="3" fill="var(--color-accent-soft)" stroke="var(--color-line-strong)" />
        <rect x="112" y="36" width="20" height="72" rx="3" transform="rotate(8 122 72)" fill="var(--muted)" opacity="0.5" />
        <path d="M150 108c0-14 10-22 22-22s22 8 22 22z" fill="var(--color-line-strong)" />
        <path d="M172 86c-2-14 4-26 14-32-1 12-5 22-14 32zM172 86c-6-10-16-14-24-12 6 8 14 12 24 12z" fill="var(--accent)" opacity="0.6" />
        <rect x="42" y="52" width="14" height="2" rx="1" fill="var(--on-accent)" opacity="0.7" />
        <rect x="42" y="58" width="10" height="2" rx="1" fill="var(--on-accent)" opacity="0.7" />
      </svg>
      <h1 className="font-display text-4xl font-normal tracking-tight">Your shelves are waiting.</h1>
      <p className="mt-3 max-w-sm text-muted">
        Drop in PDFs of books, papers, or course readers. They stay right here on your computer — private, offline, and always where you left them.
      </p>
      <Button variant="primary" className="mt-8" onClick={onAdd}>
        <Plus className="size-4" /> Add your first book
      </Button>
      <p className="mt-3 text-xs text-muted">or drag files anywhere onto this window</p>
    </div>
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
