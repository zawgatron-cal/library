import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  BookCheck,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  Maximize2,
  Minimize2,
  Minus,
  MoveHorizontal,
  PanelLeft,
  Plus,
  Settings2,
} from 'lucide-react'
import { getBookFile, newId, putHighlight, updateBook, type Book, type Highlight, type HighlightColor, type ReadingPosition } from '../../lib/db'
import { useBook, useHighlights, useLocalStorage } from '../../lib/hooks'
import '../../lib/pdf'
import { logReading } from '../../lib/readingLog'
import { navigate } from '../../lib/router'
import { useSettings } from '../../lib/settings'
import { bookProgress } from '../../lib/format'
import { Button, Dialog, IconButton, Kbd } from '../ui/primitives'
import { useToast } from '../ui/toast'
import { AnnotationPopover, type PopoverTarget } from './AnnotationPopover'
import { PageStack, type PageSize, type PageStackHandle, type PendingSelection } from './PageStack'
import { Sidebar, type SidebarTab } from './Sidebar'

const documentOptions = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
}

export function ReaderView({ bookId, onOpenSettings }: { bookId: string; onOpenSettings: () => void }) {
  const book = useBook(bookId)
  const [file, setFile] = useState<Blob | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    getBookFile(bookId).then((f) => !cancelled && setFile(f ?? null))
    return () => {
      cancelled = true
    }
  }, [bookId])

  if (book === null || file === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p className="font-display text-2xl">This book isn't on your shelves.</p>
        <Button variant="primary" onClick={() => navigate({ view: 'library' })}>
          Back to library
        </Button>
      </div>
    )
  }
  if (!book || !file) return <OpeningState />

  return <Reader key={book.id} book={book} file={file} onOpenSettings={onOpenSettings} />
}

function OpeningState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex animate-pulse items-center gap-3 text-muted">
        <BookOpen className="size-5" />
        <span className="font-display text-lg">Opening…</span>
      </div>
    </div>
  )
}

const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
/** PDF points → CSS pixels, so "100%" matches the printed size. */
const PT_TO_PX = 96 / 72
const PAGE_PAD_X = 32
/** "Fit" never grows a page past this, so lines stay a comfortable length on wide screens. */
const MAX_FIT_WIDTH = 980

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function Reader({ book, file, onOpenSettings }: { book: Book; file: Blob; onOpenSettings: () => void }) {
  const { settings, update, pageMode } = useSettings()
  const toast = useToast()
  const highlights = useHighlights(book.id)
  const stack = useRef<PageStackHandle>(null)
  const pageInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [pageSizes, setPageSizes] = useState<PageSize[] | null>(null)
  const [initialPosition] = useState<ReadingPosition | null>(book.position)
  const [currentPage, setCurrentPage] = useState(book.position?.page ?? 1)
  const [zoom, setZoom] = useState<number | 'fit'>(book.zoom)
  const [containerWidth, setContainerWidth] = useState(0)
  const [ui, setUi] = useLocalStorage<{ sidebar: SidebarTab | null }>('library:reader-ui', { sidebar: 'contents' })
  const [focus, setFocus] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [popover, setPopover] = useState<PopoverTarget | null>(null)
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const lastActivity = useRef(0)

  const pageCount = pageSizes?.length ?? book.pageCount
  const spread = settings.spread

  /* ----- loading ----- */

  const onLoad = useCallback(
    async (doc: PDFDocumentProxy) => {
      setPdf(doc)
      const sizes = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, i) => {
          const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 })
          return { w: vp.width, h: vp.height }
        }),
      )
      setPageSizes(sizes)
      if (doc.numPages !== book.pageCount) updateBook(book.id, { pageCount: doc.numPages })
    },
    [book.id, book.pageCount],
  )

  useEffect(() => {
    updateBook(book.id, { openedAt: Date.now() })
  }, [book.id])

  /* ----- scale ----- */

  const scale = useMemo(() => {
    if (zoom !== 'fit') return zoom * PT_TO_PX
    if (!pageSizes || !containerWidth) return PT_TO_PX
    const sample = pageSizes.slice(0, 12).map((s) => s.w).sort((a, b) => a - b)
    const pageW = sample[Math.floor(sample.length / 2)]
    const needed = spread ? pageW * 2 + 2 : pageW
    const available = Math.min(containerWidth - PAGE_PAD_X * 2, spread ? MAX_FIT_WIDTH * 1.8 : MAX_FIT_WIDTH)
    return Math.min(4, Math.max(0.3, available / needed))
  }, [zoom, pageSizes, containerWidth, spread])

  const displayZoom = scale / PT_TO_PX

  const applyZoom = useCallback(
    (next: number | 'fit') => {
      setZoom(next)
      updateBook(book.id, { zoom: next })
    },
    [book.id],
  )

  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      const current = displayZoom
      const next = dir > 0 ? (ZOOM_STEPS.find((z) => z > current + 0.01) ?? 3) : ([...ZOOM_STEPS].reverse().find((z) => z < current - 0.01) ?? 0.5)
      applyZoom(next)
    },
    [displayZoom, applyZoom],
  )

  /* ----- position ----- */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Page we're smooth-scrolling towards, so repeated key presses keep advancing. */
  const navTarget = useRef<{ page: number; at: number } | null>(null)
  const onScrollPosition = useCallback(
    (position: ReadingPosition, page: number) => {
      setCurrentPage(page)
      if (navTarget.current?.page === page) navTarget.current = null
      lastActivity.current = Date.now()
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => updateBook(book.id, { position }), 400)
    },
    [book.id],
  )

  const goTo = useCallback((page: number, opts?: { smooth?: boolean; offset?: number }) => {
    navTarget.current = opts?.smooth === false ? null : { page, at: Date.now() }
    stack.current?.scrollToPage(page, opts)
  }, [])
  const step = useCallback(
    (dir: 1 | -1) => {
      const pending = navTarget.current && Date.now() - navTarget.current.at < 1000 ? navTarget.current.page : null
      const from = pending ?? currentPage
      const delta = spread && from > 1 ? 2 : 1
      const target = spread && dir > 0 && from === 1 ? 2 : from + dir * delta
      goTo(Math.max(1, Math.min(pageCount, target)))
    },
    [spread, currentPage, pageCount, goTo],
  )

  /* ----- reading time ----- */

  useEffect(() => {
    lastActivity.current = Date.now()
    const TICK = 15
    const bump = () => {
      lastActivity.current = Date.now()
    }
    window.addEventListener('mousemove', bump, { passive: true })
    window.addEventListener('keydown', bump)
    const timer = setInterval(() => {
      const idle = Date.now() - lastActivity.current > 3 * 60_000
      if (document.visibilityState !== 'visible' || idle) return
      updateBook(book.id, (b) => ({ readingSeconds: b.readingSeconds + TICK }))
      logReading(TICK)
    }, TICK * 1000)
    return () => {
      clearInterval(timer)
      window.removeEventListener('mousemove', bump)
      window.removeEventListener('keydown', bump)
    }
  }, [book.id])

  /* ----- bookmarks & highlights ----- */

  const bookmarked = book.bookmarks.some((b) => b.page === currentPage)
  const toggleBookmark = useCallback(() => {
    updateBook(book.id, (b) => {
      const exists = b.bookmarks.some((x) => x.page === currentPage)
      return { bookmarks: exists ? b.bookmarks.filter((x) => x.page !== currentPage) : [...b.bookmarks, { page: currentPage, label: '', createdAt: Date.now() }] }
    })
    toast(bookmarked ? `Bookmark removed from page ${currentPage}` : `Bookmarked page ${currentPage}`)
  }, [book.id, currentPage, bookmarked, toast])

  const createFromSelection = useCallback(
    (selection: PendingSelection) => async (color: HighlightColor) => {
      const created: Highlight[] = selection.parts.map((part, i) => ({
        id: newId(),
        bookId: book.id,
        page: part.page,
        rects: part.rects,
        text: i === 0 ? selection.text : `(continued from p. ${selection.parts[0].page})`,
        color,
        note: '',
        createdAt: Date.now(),
      }))
      await Promise.all(created.map(putHighlight))
      return created[0]
    },
    [book.id],
  )

  const onSelection = useCallback(
    (selection: PendingSelection | null) => {
      setActiveHighlightId(null)
      setPopover(selection ? { kind: 'selection', text: selection.text, anchor: selection.anchor, create: createFromSelection(selection) } : null)
    },
    [createFromSelection],
  )

  const onHighlightClick = useCallback((highlight: Highlight, anchor: { x: number; y: number }) => {
    setActiveHighlightId(highlight.id)
    setPopover({ kind: 'highlight', highlight, anchor })
  }, [])

  const jumpTo = useCallback(
    (page: number, highlightId?: string) => {
      const h = highlightId ? highlights.find((x) => x.id === highlightId) : undefined
      setActiveHighlightId(highlightId ?? null)
      goTo(page, h ? { offset: h.rects[0]?.y ?? 0 } : undefined)
    },
    [highlights, goTo],
  )

  /* ----- keyboard ----- */

  const openTab = useCallback((tab: SidebarTab) => setUi((u) => ({ ...u, sidebar: tab })), [setUi])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setFocus(false)
        openTab('search')
        requestAnimationFrame(() => searchInput.current?.focus())
        return
      }
      if (isTyping(e.target) || mod || e.altKey) return
      switch (e.key) {
        case 'ArrowRight':
        case 'j':
        case 'n':
          e.preventDefault()
          step(1)
          break
        case 'ArrowLeft':
        case 'k':
        case 'p':
          e.preventDefault()
          step(-1)
          break
        case '+':
        case '=':
          stepZoom(1)
          break
        case '-':
          stepZoom(-1)
          break
        case '0':
          applyZoom('fit')
          break
        case 'b':
          toggleBookmark()
          break
        case 'f':
          setFocus((f) => !f)
          break
        case 'd':
          update({ spread: !settings.spread })
          break
        case 't':
        case '[':
          setUi((u) => ({ ...u, sidebar: u.sidebar ? null : 'contents' }))
          break
        case '/':
          e.preventDefault()
          setFocus(false)
          openTab('search')
          requestAnimationFrame(() => searchInput.current?.focus())
          break
        case 'g':
          e.preventDefault()
          setFocus(false)
          requestAnimationFrame(() => pageInput.current?.select())
          break
        case 'h':
          if (popover?.kind === 'selection') {
            popover.create('sun').then(() => window.getSelection()?.removeAllRanges())
            setPopover(null)
          }
          break
        case '?':
          setShowHelp((s) => !s)
          break
        case 'Escape':
          if (popover) setPopover(null)
          else if (focus) setFocus(false)
          setActiveHighlightId(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, stepZoom, applyZoom, toggleBookmark, update, settings.spread, setUi, openTab, popover, focus])

  /* ----- focus-mode chrome ----- */

  const [chrome, setChrome] = useState(true)
  useEffect(() => {
    if (!focus) return
    let timer: ReturnType<typeof setTimeout>
    const show = () => {
      setChrome(true)
      clearTimeout(timer)
      timer = setTimeout(() => setChrome(false), 1800)
    }
    show()
    window.addEventListener('mousemove', show)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mousemove', show)
    }
  }, [focus])

  const progress = bookProgress({ position: { page: currentPage, offset: 0 }, pageCount, finishedAt: null })
  const sidebarOpen = !focus && ui.sidebar !== null

  return (
    <div className="flex h-full flex-col">
      {!focus && (
        <header className="relative z-20 flex shrink-0 items-center gap-1 border-b border-line bg-surface px-2 py-1.5">
          <IconButton label="Back to library" onClick={() => navigate({ view: 'library' })}>
            <ArrowLeft />
          </IconButton>
          <IconButton label="Toggle sidebar (T)" active={sidebarOpen} onClick={() => setUi((u) => ({ ...u, sidebar: u.sidebar ? null : 'contents' }))}>
            <PanelLeft />
          </IconButton>
          <div className="ml-2 min-w-0 flex-1">
            <p className="truncate font-display text-[0.95rem] leading-tight font-medium">{book.title}</p>
            {book.author && <p className="truncate text-[0.7rem] text-muted">{book.author}</p>}
          </div>

          <div className="flex items-center gap-1">
            {currentPage === pageCount && !book.finishedAt && (
              <Button size="sm" variant="soft" className="mr-2" onClick={() => updateBook(book.id, { finishedAt: Date.now() }).then(() => toast(`Finished “${book.title}” — well read!`))}>
                <BookCheck className="size-3.5" /> Mark as finished
              </Button>
            )}
            <IconButton label="Previous page" onClick={() => step(-1)} disabled={currentPage <= 1}>
              <ChevronLeft />
            </IconButton>
            <form
              className="flex items-center gap-1 text-sm"
              onSubmit={(e) => {
                e.preventDefault()
                const n = Number(pageInput.current?.value)
                if (n >= 1 && n <= pageCount) goTo(n, { smooth: false })
                pageInput.current?.blur()
              }}
            >
              <input
                ref={pageInput}
                key={currentPage}
                defaultValue={currentPage}
                inputMode="numeric"
                aria-label="Page number"
                className="w-11 rounded-md border border-transparent bg-sunken px-1 py-1 text-center text-sm font-semibold tabular-nums outline-none focus:border-accent"
                onBlur={(e) => (e.target.value = String(currentPage))}
              />
              <span className="text-muted tabular-nums">/ {pageCount}</span>
            </form>
            <IconButton label="Next page" onClick={() => step(1)} disabled={currentPage >= pageCount}>
              <ChevronRight />
            </IconButton>
          </div>

          <span className="mx-2 hidden h-5 w-px bg-line sm:block" />

          <div className="hidden items-center gap-0.5 sm:flex">
            <IconButton label="Zoom out (−)" onClick={() => stepZoom(-1)}>
              <Minus />
            </IconButton>
            <button type="button" onClick={() => applyZoom('fit')} title="Fit to width (0)" className="w-12 rounded-md py-1 text-xs font-bold text-muted tabular-nums hover:bg-hover hover:text-ink">
              {Math.round(displayZoom * 100)}%
            </button>
            <IconButton label="Zoom in (+)" onClick={() => stepZoom(1)}>
              <Plus />
            </IconButton>
            <IconButton label="Fit to width (0)" active={zoom === 'fit'} onClick={() => applyZoom('fit')}>
              <MoveHorizontal />
            </IconButton>
            <IconButton label="Two-page spread (D)" active={spread} onClick={() => update({ spread: !spread })}>
              <BookOpen />
            </IconButton>
          </div>

          <span className="mx-2 hidden h-5 w-px bg-line sm:block" />

          <IconButton label={bookmarked ? 'Remove bookmark (B)' : 'Bookmark this page (B)'} active={bookmarked} onClick={toggleBookmark}>
            <Bookmark className={bookmarked ? 'fill-current' : ''} />
          </IconButton>
          <IconButton label="Focus mode (F)" onClick={() => setFocus(true)}>
            <Maximize2 />
          </IconButton>
          <IconButton label="Keyboard shortcuts (?)" onClick={() => setShowHelp(true)} className="hidden md:inline-flex">
            <Keyboard />
          </IconButton>
          <IconButton label="Appearance & settings" onClick={onOpenSettings}>
            <Settings2 />
          </IconButton>

          <div className="absolute inset-x-0 -bottom-px h-0.5 bg-transparent">
            <div className="h-full bg-accent/70 transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            tab={ui.sidebar!}
            onTab={openTab}
            onClose={() => setUi((u) => ({ ...u, sidebar: null }))}
            pdf={pdf}
            book={book}
            highlights={highlights}
            currentPage={currentPage}
            searchQuery={searchQuery}
            onSearch={setSearchQuery}
            onJump={jumpTo}
            activeHighlightId={activeHighlightId}
            searchInputRef={searchInput}
          />
        )}

        <main className="relative min-w-0 flex-1 bg-sunken">
          <Document
            file={file}
            options={documentOptions}
            onLoadSuccess={onLoad}
            onItemClick={({ pageNumber }) => goTo(pageNumber)}
            loading={<OpeningState />}
            error={
              <div className="flex h-full items-center justify-center p-8 text-center text-muted">
                This PDF couldn't be opened. It may be damaged or password-protected.
              </div>
            }
            className="h-full"
          >
            {pageSizes ? (
              <PageStack
                ref={stack}
                pageSizes={pageSizes}
                scale={scale}
                spread={spread}
                gap={settings.pageGap}
                pageMode={pageMode}
                initialPosition={initialPosition}
                highlights={highlights}
                activeHighlightId={activeHighlightId}
                searchQuery={searchQuery}
                onScrollPosition={onScrollPosition}
                onResize={setContainerWidth}
                onSelection={onSelection}
                onHighlightClick={onHighlightClick}
              />
            ) : (
              <OpeningState />
            )}
          </Document>

          {focus && (
            <div className={`pointer-events-none absolute inset-x-0 bottom-6 flex justify-center transition-opacity duration-500 ${chrome ? 'opacity-100' : 'opacity-0'}`}>
              <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-surface/90 px-2 py-1 shadow-lifted backdrop-blur">
                <IconButton label="Previous page" onClick={() => step(-1)}>
                  <ChevronLeft />
                </IconButton>
                <span className="px-2 text-xs font-bold text-muted tabular-nums">
                  {currentPage} / {pageCount}
                </span>
                <IconButton label="Next page" onClick={() => step(1)}>
                  <ChevronRight />
                </IconButton>
                <span className="mx-1 h-4 w-px bg-line" />
                <IconButton label="Exit focus mode (Esc)" onClick={() => setFocus(false)}>
                  <Minimize2 />
                </IconButton>
              </div>
            </div>
          )}
          {focus && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5">
              <div className="h-full bg-accent/60" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </main>
      </div>

      {popover && (
        <AnnotationPopover
          key={popover.kind === 'highlight' ? popover.highlight.id : `${popover.anchor.x},${popover.anchor.y}`}
          target={popover}
          onClose={() => {
            setPopover(null)
            setActiveHighlightId(null)
          }}
          onCopied={() => toast('Copied to clipboard')}
        />
      )}
      {showHelp && <ShortcutsDialog onClose={() => setShowHelp(false)} />}
    </div>
  )
}

const SHORTCUTS: [string[], string][] = [
  [['→', 'J'], 'Next page'],
  [['←', 'K'], 'Previous page'],
  [['G'], 'Go to page…'],
  [['+', '−'], 'Zoom in / out'],
  [['0'], 'Fit to width'],
  [['D'], 'Two-page spread'],
  [['B'], 'Bookmark page'],
  [['H'], 'Highlight selection'],
  [['/'], 'Search in book'],
  [['T'], 'Toggle sidebar'],
  [['F'], 'Focus mode'],
  [['Esc'], 'Close / exit focus'],
]

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width="max-w-lg">
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
