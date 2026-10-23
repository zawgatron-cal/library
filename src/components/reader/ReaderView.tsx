import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document } from 'react-pdf'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { ArrowLeft, Bookmark, BookCheck, BookOpen, ChevronLeft, ChevronRight, CornerUpLeft, Keyboard, Maximize2, Minimize2, Minus, Pause, PanelLeft, PanelRight, Plus, ScanText, Settings2, X } from 'lucide-react'
import { getBookFile, newId, putHighlight, updateBook, type Book, type Highlight, type HighlightColor, type ReadingPosition } from '../../lib/db'
import { useBook, useHighlights, useLocalStorage, useOcrPages, useOcrProgress } from '../../lib/hooks'
import { extraRotation, normalizeRotation, rotateRect } from '../../lib/geometry'
import { GOOD_CONFIDENCE, focusOcr, pauseOcr, queueOcr, type OcrProgress } from '../../lib/ocr'
import { documentOptions, looksScanned } from '../../lib/pdf'
import { navigate } from '../../lib/router'
import { useSettings } from '../../lib/settings'
import { bookProgress } from '../../lib/format'
import type { PageLayout } from '../../lib/preferences'
import { Button, Dialog, IconButton, Kbd } from '../ui/primitives'
import { useToast } from '../ui/toast'
import { AnnotationPopover, type PopoverTarget } from './AnnotationPopover'
import { GoToDialog } from './GoToDialog'
import { clampZoom, fitScale, type PageSize } from './layout'
import { PageStack, type PageStackHandle, type PendingSelection } from './PageStack'
import { Sidebar, type SidebarTab } from './Sidebar'
import { ViewMenu, ZoomControl } from './ViewControls'

const SIDEBAR_TABS: SidebarTab[] = ['contents', 'pages', 'search', 'annotations', 'bookmarks', 'notes']

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
  if (!book || !file) return <ReaderFrame />

  return <Reader key={book.id} book={book} file={file} onOpenSettings={onOpenSettings} />
}

/** What's on screen while the book is still opening. */
function ReaderFrame() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-[3.25rem] shrink-0 border-b border-line bg-surface" />
      <main data-reader-stage className="flex-1 bg-sunken">
        <OpeningState />
      </main>
    </div>
  )
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

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]
/** PDF points → CSS pixels, so "100%" matches the printed size. */
const PT_TO_PX = 96 / 72

function viewportSize(page: PDFPageProxy) {
  const vp = page.getViewport({ scale: 1 })
  return { w: vp.width, h: vp.height }
}

/**
 * Find the pages that aren't the size of page 1 (fold-outs, landscape tables, covers). Most books have none, so the
 * reader lays out with page 1's size at once and this runs afterwards in small batches, out of the way of the pages
 * being drawn. The result is saved, so it only happens the first time a book is opened.
 */
async function measurePages(doc: PDFDocumentProxy, first: PageSize) {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const odd: Record<number, [number, number, number]> = {}
  try {
    for (let start = 2; start <= doc.numPages; start += 24) {
      const batch = Array.from({ length: Math.min(24, doc.numPages - start + 1) }, (_, i) => start + i)
      for (const page of await Promise.all(batch.map((n) => doc.getPage(n)))) {
        const { w, h } = viewportSize(page)
        if (Math.abs(w - first.w) > 0.5 || Math.abs(h - first.h) > 0.5 || page.rotate !== first.rotate) odd[page.pageNumber] = [w, h, page.rotate]
      }
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  } catch {
    return null
  }
  return odd
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function Reader({ book, file, onOpenSettings }: { book: Book; file: Blob; onOpenSettings: () => void }) {
  const { settings, update, pageMode } = useSettings()
  const toast = useToast()
  const highlights = useHighlights(book.id)
  const stack = useRef<PageStackHandle>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [baseSizes, setBaseSizes] = useState<PageSize[] | null>(null)
  const [pageLabels, setPageLabels] = useState<string[] | null>(null)
  const [initialPosition] = useState<ReadingPosition | null>(book.position)
  const [currentPage, setCurrentPage] = useState(book.position?.page ?? 1)
  const [zoom, setZoom] = useState<number | 'fit'>(book.zoom)
  const [container, setContainer] = useState({ w: 0, h: 0 })
  const [ui, setUi] = useLocalStorage<{ sidebar: SidebarTab | null }>('library:reader-ui', { sidebar: 'contents' })
  const [focus, setFocus] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [popover, setPopover] = useState<PopoverTarget | null>(null)
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null)
  const [hoverHighlightId, setHoverHighlightId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'help' | 'goto' | null>(null)
  const [history, setHistory] = useState<number[]>([])

  const pageCount = baseSizes?.length ?? book.pageCount
  const ocrPages = useOcrPages(book.id)
  const ocrProgress = useOcrProgress(book.id)

  /* ----- rotation ----- */

  const rotations = useMemo(
    () => Array.from({ length: pageCount }, (_, i) => extraRotation({ rotation: book.rotation, pageRotations: book.pageRotations }, i + 1)),
    [pageCount, book.rotation, book.pageRotations],
  )
  /**
   * Page sizes as shown, with sideways pages' width and height swapped. A single page turned on its side is scaled
   * down to fit the space its neighbours take, like a fold-out plate, rather than spilling out of the view.
   */
  const pageSizes = useMemo(() => {
    if (!baseSizes) return null
    const shown = baseSizes.map((s, i) => (rotations[i] % 180 ? { ...s, w: s.h, h: s.w } : s))
    const turned = (i: number) => normalizeRotation(book.pageRotations?.[i + 1] ?? 0) % 180 !== 0
    const upright = shown.filter((_, i) => !turned(i))
    if (upright.length === shown.length || !upright.length) return shown
    const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const typicalW = median(upright.map((s) => s.w))
    const typicalH = median(upright.map((s) => s.h))
    return shown.map((s, i) => {
      if (!turned(i)) return s
      const fit =
        settings.pageLayout !== 'continuous'
          ? Math.min(typicalW / s.w, typicalH / s.h)
          : settings.scrollDirection === 'vertical'
            ? typicalW / s.w
            : typicalH / s.h
      return fit < 1 ? { ...s, w: s.w * fit, h: s.h * fit, fit } : s
    })
  }, [baseSizes, rotations, book.pageRotations, settings.pageLayout, settings.scrollDirection])

  const rotateView = useCallback((by: 90 | -90) => updateBook(book.id, (b) => ({ rotation: normalizeRotation((b.rotation ?? 0) + by) })), [book.id])
  const rotatePage = useCallback(
    (page: number) => {
      updateBook(book.id, (b) => ({ pageRotations: { ...b.pageRotations, [page]: normalizeRotation((b.pageRotations?.[page] ?? 0) + 90) } }))
      // Text that was read poorly may have been read sideways; try again the new way up.
      if ((ocrPages.get(page)?.confidence ?? 100) < GOOD_CONFIDENCE) queueOcr(book.id)
    },
    [book.id, ocrPages],
  )
  const resetRotation = useCallback(() => {
    const reread = Object.keys(book.pageRotations ?? {}).some((p) => (ocrPages.get(Number(p))?.confidence ?? 100) < GOOD_CONFIDENCE)
    updateBook(book.id, { rotation: 0, pageRotations: {} }).then(() => {
      if (reread) queueOcr(book.id)
    })
  }, [book.id, book.pageRotations, ocrPages])
  const { pageLayout: layout, scrollDirection: direction, margins } = settings
  const sidebarTab = ui.sidebar && SIDEBAR_TABS.includes(ui.sidebar) ? ui.sidebar : ui.sidebar ? 'contents' : null

  /* ----- loading ----- */

  const onLoad = useCallback(
    async (doc: PDFDocumentProxy) => {
      setPdf(doc)
      doc.getPageLabels().then(setPageLabels, () => setPageLabels(null))
      const firstPage = await doc.getPage(1)
      const first = { ...viewportSize(firstPage), rotate: firstPage.rotate }
      const withOdd = (odd: Record<number, [number, number, number]>) =>
        Array.from({ length: doc.numPages }, (_, i) => (odd[i + 1] ? { w: odd[i + 1][0], h: odd[i + 1][1], rotate: odd[i + 1][2] } : first))
      setBaseSizes(withOdd(book.oddPages ?? {}))
      if (!book.oddPages) {
        const odd = await measurePages(doc, first)
        if (!odd) return
        if (Object.keys(odd).length) setBaseSizes(withOdd(odd))
        updateBook(book.id, { oddPages: odd })
      }
      if (doc.numPages !== book.pageCount) updateBook(book.id, { pageCount: doc.numPages })
    },
    // Sizes are only read once, when the document loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.id, book.pageCount],
  )

  useEffect(() => {
    updateBook(book.id, { openedAt: Date.now() })
  }, [book.id])

  /* ----- text recognition ----- */

  useEffect(() => focusOcr(book.id, currentPage), [book.id, currentPage])

  // Offer to read the text of books that turn out to be scans (ones imported before this existed, mostly).
  const [scanned, setScanned] = useState(false)
  useEffect(() => {
    if (!pdf || book.ocr != null) return
    let cancelled = false
    looksScanned(pdf).then((s) => !cancelled && setScanned(s))
    return () => {
      cancelled = true
    }
  }, [pdf, book.ocr])

  /* ----- zoom ----- */

  const scale = useMemo(() => {
    if (zoom !== 'fit') return zoom * PT_TO_PX
    if (!pageSizes) return PT_TO_PX
    return fitScale(pageSizes, { layout, direction, margins }, container.w, container.h)
  }, [zoom, pageSizes, container, layout, direction, margins])

  const displayZoom = scale / PT_TO_PX
  const displayZoomRef = useRef(displayZoom)
  useEffect(() => {
    displayZoomRef.current = displayZoom
  })

  const zoomSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const applyZoom = useCallback(
    (next: number | 'fit') => {
      setZoom(next)
      clearTimeout(zoomSaveTimer.current)
      zoomSaveTimer.current = setTimeout(() => updateBook(book.id, { zoom: next }), 500)
    },
    [book.id],
  )

  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      const current = displayZoomRef.current
      const next = dir > 0 ? (ZOOM_STEPS.find((z) => z > current + 0.01) ?? 4) : ([...ZOOM_STEPS].reverse().find((z) => z < current - 0.01) ?? 0.25)
      applyZoom(next)
    },
    [applyZoom],
  )

  const onPinchZoom = useCallback((factor: number) => applyZoom(clampZoom(displayZoomRef.current * factor)), [applyZoom])
  const onResize = useCallback((w: number, h: number) => setContainer({ w, h }), [])

  /* ----- position & navigation ----- */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** Page we're smooth-scrolling towards, so repeated key presses keep advancing. */
  const navTarget = useRef<{ page: number; at: number } | null>(null)
  const onScrollPosition = useCallback(
    (position: ReadingPosition, page: number) => {
      setCurrentPage(page)
      if (navTarget.current?.page === page) navTarget.current = null
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => updateBook(book.id, { position }), 400)
    },
    [book.id],
  )

  const goTo = useCallback((page: number, opts?: { smooth?: boolean; offset?: number }) => {
    navTarget.current = opts?.smooth === false ? null : { page, at: Date.now() }
    stack.current?.scrollToPage(page, opts)
  }, [])

  /** A deliberate jump (contents, search, link, go-to) — remember where we came from. */
  const jump = useCallback(
    (page: number, opts?: { offset?: number }) => {
      if (Math.abs(page - currentPage) > 1) setHistory((h) => [...h.slice(-19), currentPage])
      goTo(page, opts)
    },
    [currentPage, goTo],
  )

  const goBack = useCallback(() => {
    const page = history.at(-1)
    if (page === undefined) return
    setHistory((h) => h.slice(0, -1))
    goTo(page)
  }, [history, goTo])

  const step = useCallback(
    (dir: 1 | -1) => {
      const pending = navTarget.current && Date.now() - navTarget.current.at < 1000 ? navTarget.current.page : null
      const from = pending ?? currentPage
      const double = layout === 'double'
      const delta = double && from > 1 ? 2 : 1
      const target = double && dir > 0 && from === 1 ? 2 : from + dir * delta
      goTo(Math.max(1, Math.min(pageCount, target)))
    },
    [layout, currentPage, pageCount, goTo],
  )

  /* ----- bookmarks & highlights ----- */

  const bookmarkedPages = useMemo(() => new Set(book.bookmarks.map((b) => b.page)), [book.bookmarks])
  const bookmarked = bookmarkedPages.has(currentPage)

  const toggleBookmark = useCallback(
    (page: number) => {
      updateBook(book.id, (b) => {
        const exists = b.bookmarks.some((x) => x.page === page)
        return { bookmarks: exists ? b.bookmarks.filter((x) => x.page !== page) : [...b.bookmarks, { page, label: '', createdAt: Date.now() }] }
      })
    },
    [book.id],
  )

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
      jump(page, h?.rects[0] ? { offset: rotateRect(h.rects[0], rotations[page - 1] ?? 0).y } : undefined)
    },
    [highlights, jump, rotations],
  )

  /* ----- layout ----- */

  const setLayout = useCallback(
    (patch: { pageLayout?: PageLayout; scrollDirection?: 'vertical' | 'horizontal'; margins?: boolean }) => update(patch),
    [update],
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
      if (dialog || isTyping(e.target) || mod || e.altKey) return
      const horizontal = direction === 'horizontal'
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          if (e.key === (horizontal ? 'ArrowDown' : 'ArrowRight') && layout === 'continuous') return
          e.preventDefault()
          step(1)
          break
        case 'j':
        case 'n':
        case 'PageDown':
          e.preventDefault()
          step(1)
          break
        case 'ArrowLeft':
        case 'ArrowUp':
          if (e.key === (horizontal ? 'ArrowUp' : 'ArrowLeft') && layout === 'continuous') return
          e.preventDefault()
          step(-1)
          break
        case 'k':
        case 'PageUp':
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
          toggleBookmark(currentPage)
          toast(bookmarked ? `Bookmark removed from page ${currentPage}` : `Bookmarked page ${currentPage}`)
          break
        case 'f':
          setFocus((f) => !f)
          break
        case 'd':
          setLayout({ pageLayout: layout === 'double' ? 'continuous' : 'double' })
          break
        case 'v':
          setLayout({ scrollDirection: horizontal ? 'vertical' : 'horizontal' })
          break
        case 'm':
          setLayout({ margins: !margins })
          break
        case 'r':
          rotateView(90)
          break
        case 'R':
          rotateView(-90)
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
        case 'p':
          setFocus(false)
          setUi((u) => ({ ...u, sidebar: u.sidebar === 'pages' ? null : 'pages' }))
          break
        case 'g':
          e.preventDefault()
          setDialog('goto')
          break
        case 'Backspace':
          goBack()
          break
        case 'h':
          if (popover?.kind === 'selection') {
            popover.create('sun').then(() => window.getSelection()?.removeAllRanges())
            setPopover(null)
          }
          break
        case '?':
          setDialog('help')
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
  }, [step, stepZoom, applyZoom, toggleBookmark, currentPage, bookmarked, toast, setLayout, layout, direction, margins, setUi, openTab, popover, focus, dialog, goBack, rotateView])

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
  const sidebarOpen = !focus && sidebarTab !== null
  const label = pageLabels?.[currentPage - 1]
  const showLabel = label && label !== String(currentPage)

  return (
    <div className="flex h-full flex-col">
      {!focus && (
        <header className="relative z-20 flex h-[3.25rem] shrink-0 animate-fade-in items-center gap-1 border-b border-line bg-surface px-2">
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

          <div className="flex items-center gap-0.5">
            {currentPage === pageCount && !book.finishedAt && (
              <Button size="sm" variant="soft" className="mr-2" onClick={() => updateBook(book.id, { finishedAt: Date.now() }).then(() => toast('Marked as finished'))}>
                <BookCheck className="size-3.5" /> Mark as finished
              </Button>
            )}
            <IconButton label="Previous page" onClick={() => step(-1)} disabled={currentPage <= 1}>
              <ChevronLeft />
            </IconButton>
            <button
              type="button"
              onClick={() => setDialog('goto')}
              title="Go to page (G)"
              className="flex items-baseline gap-1 rounded-md px-2 py-1.5 text-sm tabular-nums transition hover:bg-hover"
            >
              <span className="font-bold">{currentPage}</span>
              <span className="text-muted">/ {pageCount}</span>
              {showLabel && <span className="ml-1 text-xs text-muted">p. {label}</span>}
            </button>
            <IconButton label="Next page" onClick={() => step(1)} disabled={currentPage >= pageCount}>
              <ChevronRight />
            </IconButton>
          </div>

          <span className="mx-2 hidden h-5 w-px bg-line sm:block" />

          <div className="hidden items-center gap-0.5 sm:flex">
            <IconButton label="Zoom out (−)" onClick={() => stepZoom(-1)}>
              <Minus />
            </IconButton>
            <ZoomControl zoom={displayZoom} isFit={zoom === 'fit'} onZoom={applyZoom} />
            <IconButton label="Zoom in (+)" onClick={() => stepZoom(1)}>
              <Plus />
            </IconButton>
            <ViewMenu
              layout={layout}
              direction={direction}
              margins={margins}
              onChange={setLayout}
              rotation={book.rotation ?? 0}
              currentPage={currentPage}
              pageRotated={Object.values(book.pageRotations ?? {}).some(Boolean)}
              onRotateView={rotateView}
              onRotatePage={rotatePage}
              onResetRotation={resetRotation}
            />
            <IconButton label="Margin notes (M)" active={margins} onClick={() => setLayout({ margins: !margins })}>
              <PanelRight />
            </IconButton>
          </div>

          <span className="mx-2 hidden h-5 w-px bg-line sm:block" />

          <IconButton
            label={bookmarked ? 'Remove bookmark (B)' : 'Bookmark this page (B)'}
            active={bookmarked}
            onClick={() => {
              toggleBookmark(currentPage)
              toast(bookmarked ? `Bookmark removed from page ${currentPage}` : `Bookmarked page ${currentPage}`)
            }}
          >
            <Bookmark className={bookmarked ? 'fill-current' : ''} />
          </IconButton>
          <IconButton label="Focus mode (F)" onClick={() => setFocus(true)}>
            <Maximize2 />
          </IconButton>
          <IconButton label="Keyboard shortcuts (?)" onClick={() => setDialog('help')} className="hidden md:inline-flex">
            <Keyboard />
          </IconButton>
          <IconButton label="Appearance & settings" onClick={onOpenSettings}>
            <Settings2 />
          </IconButton>

          <div className="absolute inset-x-0 -bottom-px h-0.5 bg-transparent">
            <div className="h-full bg-flourish/80 transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1">
        {sidebarOpen && (
          <Sidebar
            tab={sidebarTab!}
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
            pageSizes={pageSizes}
            pageLabels={pageLabels}
            rotations={rotations}
            ocrPages={ocrPages}
            onRotatePage={rotatePage}
            searchInputRef={searchInput}
          />
        )}

        <main data-reader-stage className="relative min-w-0 flex-1 bg-sunken">
          <Document
            file={file}
            options={documentOptions}
            onLoadSuccess={onLoad}
            onItemClick={({ pageNumber }) => jump(pageNumber)}
            loading={<OpeningState />}
            error={
              <div className="flex h-full items-center justify-center p-8 text-center text-muted">
                This PDF couldn't be opened. It may be damaged or password-protected.
              </div>
            }
            className="h-full"
          >
            {pageSizes ? (
              <div className="h-full animate-fade-in">
                <PageStack
                  ref={stack}
                  pageSizes={pageSizes}
                  scale={scale}
                  layout={layout}
                  direction={direction}
                  margins={margins}
                  gap={settings.pageGap}
                  pageMode={pageMode}
                  initialPosition={initialPosition}
                  highlights={highlights}
                  rotations={rotations}
                  ocrPages={ocrPages}
                  activeHighlightId={hoverHighlightId ?? activeHighlightId}
                  bookmarkedPages={bookmarkedPages}
                  searchQuery={searchQuery}
                  onScrollPosition={onScrollPosition}
                  onResize={onResize}
                  onSelection={onSelection}
                  onHighlightClick={onHighlightClick}
                  onHighlightHover={setHoverHighlightId}
                  onToggleBookmark={toggleBookmark}
                  onPinchZoom={onPinchZoom}
                />
              </div>
            ) : (
              <OpeningState />
            )}
          </Document>

          {!focus && book.ocr === 'queued' && (
            <OcrPill progress={ocrProgress} onPause={() => pauseOcr(book.id).then(() => toast('Paused — resume from the book’s details'))} />
          )}
          {!focus && book.ocr == null && scanned && (
            <div className="absolute bottom-5 left-5 z-20 flex max-w-sm animate-rise flex-col gap-2.5 rounded-xl border border-line bg-surface p-4 shadow-lifted">
              <p className="flex items-center gap-2 font-display text-[0.95rem] font-medium">
                <ScanText className="size-4 text-accent" /> This looks like a scan
              </p>
              <p className="text-xs leading-relaxed text-muted">Recognise its text to search, select and annotate it. It's read right here on your computer.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => queueOcr(book.id)}>
                  Recognise text
                </Button>
                <Button size="sm" variant="ghost" onClick={() => pauseOcr(book.id)}>
                  Not now
                </Button>
              </div>
            </div>
          )}
          {history.length > 0 && !focus && (
            <div className="absolute bottom-5 left-5 flex animate-rise items-center overflow-hidden rounded-full border border-line bg-surface/95 shadow-lifted backdrop-blur">
              <button type="button" onClick={goBack} className="flex items-center gap-2 py-2 pr-2 pl-3.5 text-xs font-bold hover:text-accent-strong" title="Go back (Backspace)">
                <CornerUpLeft className="size-3.5" />
                Back to page {history.at(-1)}
              </button>
              <button type="button" aria-label="Dismiss" onClick={() => setHistory([])} className="py-2 pr-3 pl-1 text-muted hover:text-ink">
                <X className="size-3.5" />
              </button>
            </div>
          )}

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
              <div className="h-full bg-flourish/70" style={{ width: `${progress * 100}%` }} />
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
      {dialog === 'help' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {dialog === 'goto' && <GoToDialog pageCount={pageCount} currentPage={currentPage} labels={pageLabels} onGo={(p) => jump(p)} onClose={() => setDialog(null)} />}
    </div>
  )
}

const SHORTCUTS: [string[], string][] = [
  [['→', 'J'], 'Next page'],
  [['←', 'K'], 'Previous page'],
  [['G'], 'Go to page…'],
  [['⌫'], 'Back after a jump'],
  [['+', '−'], 'Zoom in / out'],
  [['0'], 'Fit'],
  [['D'], 'Two pages'],
  [['V'], 'Scroll direction'],
  [['M'], 'Margin notes'],
  [['R', '⇧R'], 'Rotate right / left'],
  [['B'], 'Bookmark page'],
  [['H'], 'Highlight selection'],
  [['/'], 'Search in book'],
  [['T'], 'Toggle sidebar'],
  [['P'], 'Page thumbnails'],
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

function OcrPill({ progress, onPause }: { progress?: OcrProgress; onPause: () => void }) {
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
