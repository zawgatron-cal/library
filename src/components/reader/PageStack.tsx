import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Page } from 'react-pdf'
import type { Highlight, ReadingPosition, Rect } from '../../lib/db'
import { escapeHtml, escapeRegExp } from '../../lib/format'
import type { PageLayout, ScrollDirection } from '../../lib/preferences'
import type { PageMode } from '../../lib/themes'
import { screenReady } from '../../lib/router'
import { FACING_GAP, MARGIN_GAP, MARGIN_W, PAD, READING_LINE, buildLayout, cellIndexAt, type Cell, type PageSize } from './layout'

export type SelectionPart = { page: number; rects: Rect[] }
export type PendingSelection = { parts: SelectionPart[]; text: string; anchor: { x: number; y: number } }

export type PageStackHandle = {
  scrollToPage: (page: number, options?: { smooth?: boolean; offset?: number }) => void
  /** Keep the content under this viewport point fixed through the next layout change (e.g. zoom). */
  anchorAt: (clientX: number, clientY: number) => void
}

function mergeRects(rects: Rect[]) {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const out: Rect[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    const sameLine = last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) * 0.5
    if (last && sameLine && r.x <= last.x + last.w + 0.012) {
      const x = Math.min(last.x, r.x)
      const y = Math.min(last.y, r.y)
      last.w = Math.max(last.x + last.w, r.x + r.w) - x
      last.h = Math.max(last.y + last.h, r.y + r.h) - y
      last.x = x
      last.y = y
    } else {
      out.push({ ...r })
    }
  }
  return out
}

function readSelection(container: HTMLElement): PendingSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.commonAncestorContainer)) return null
  const text = selection.toString().trim()
  if (!text) return null

  const pageBoxes = [...container.querySelectorAll<HTMLElement>('[data-page]')].map((el) => ({ page: Number(el.dataset.page), box: el.getBoundingClientRect() }))
  const byPage = new Map<number, Rect[]>()

  for (const r of range.getClientRects()) {
    if (r.width < 1 || r.height < 1) continue
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const hit = pageBoxes.find(({ box }) => cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom)
    if (!hit) continue
    const { box } = hit
    const rect = { x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height }
    // Skip container-sized rects pdf.js sometimes reports for whole text layers.
    if (rect.h > 0.12 || rect.w > 0.98) continue
    if (!byPage.has(hit.page)) byPage.set(hit.page, [])
    byPage.get(hit.page)!.push(rect)
  }

  const parts = [...byPage.entries()].map(([page, rects]) => ({ page, rects: mergeRects(rects) })).filter((p) => p.rects.length)
  if (!parts.length) return null
  const last = [...range.getClientRects()].filter((r) => r.width > 0).at(-1) ?? range.getBoundingClientRect()
  return { parts, text, anchor: { x: last.right, y: last.bottom } }
}

/** Snap points with scroll-snap-stop would halt programmatic jumps at the next page, so pause snapping meanwhile. */
function scrollWithoutSnap(el: HTMLElement, options: ScrollToOptions) {
  el.dataset.snapPaused = 'true'
  el.scrollTo(options)
  const resume = () => delete el.dataset.snapPaused
  if (options.behavior === 'smooth') {
    const timer = setTimeout(resume, 1200)
    el.addEventListener(
      'scrollend',
      () => {
        clearTimeout(timer)
        resume()
      },
      { once: true },
    )
  } else {
    requestAnimationFrame(resume)
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

type Anchor = { page: number; offset: number; crossFrac: number; viewMain: number; viewCross: number }

type Props = {
  pageSizes: PageSize[]
  scale: number
  layout: PageLayout
  direction: ScrollDirection
  margins: boolean
  gap: number
  pageMode: PageMode
  initialPosition: ReadingPosition | null
  highlights: Highlight[]
  activeHighlightId: string | null
  bookmarkedPages: Set<number>
  searchQuery: string
  onScrollPosition: (position: ReadingPosition, currentPage: number) => void
  onResize: (width: number, height: number) => void
  onSelection: (selection: PendingSelection | null) => void
  onHighlightClick: (highlight: Highlight, anchor: { x: number; y: number }) => void
  onHighlightHover: (id: string | null) => void
  onToggleBookmark: (page: number) => void
  onPinchZoom: (factor: number) => void
  ref?: Ref<PageStackHandle>
}

export function PageStack(props: Props) {
  const { pageSizes, scale, layout, direction, margins, gap, pageMode, initialPosition, highlights, activeHighlightId, bookmarkedPages, searchQuery } = props
  const { onScrollPosition, onResize, onSelection, onHighlightClick, onHighlightHover, onToggleBookmark, onPinchZoom, ref } = props
  const vertical = direction === 'vertical'
  const paged = layout !== 'continuous'

  const scrollEl = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ scroll: 0, width: 0, height: 0 })
  const anchor = useRef<Anchor>({ page: initialPosition?.page ?? 1, offset: initialPosition?.offset ?? 0, crossFrac: 0.5, viewMain: -1, viewCross: -1 })
  const frame = useRef(0)
  const renderScale = useDebounced(scale, 220)

  const viewMain = vertical ? viewport.height : viewport.width
  const viewCross = vertical ? viewport.width : viewport.height
  const opts = useMemo(() => ({ layout, direction, margins }), [layout, direction, margins])
  const { cells, total, crossTotal } = useMemo(() => buildLayout(pageSizes, scale, opts, gap, viewMain, viewCross), [pageSizes, scale, opts, gap, viewMain, viewCross])
  const cellOfPage = useMemo(() => {
    const map = new Map<number, number>()
    cells.forEach((cell, i) => cell.pages.forEach((p) => map.set(p, i)))
    return map
  }, [cells])

  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>()
    for (const h of highlights) {
      if (!map.has(h.page)) map.set(h.page, [])
      map.get(h.page)!.push(h)
    }
    return map
  }, [highlights])

  const textRenderer = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return undefined
    const pattern = new RegExp(`(${escapeRegExp(q)})`, 'gi')
    return ({ str }: { str: string }) => str.split(pattern).map((part, i) => (i % 2 ? `<mark>${escapeHtml(part)}</mark>` : escapeHtml(part))).join('')
  }, [searchQuery])

  const contentMain = useCallback((cell: Cell) => (vertical ? cell.contentH : cell.contentW), [vertical])
  const contentStart = useCallback((cell: Cell) => cell.start + (cell.size - contentMain(cell)) / 2, [contentMain])

  const measure = useCallback(
    (atMain: number, atCross: number): Anchor | null => {
      const el = scrollEl.current
      if (!el || !cells.length) return null
      const scrollMain = vertical ? el.scrollTop : el.scrollLeft
      const scrollCross = vertical ? el.scrollLeft : el.scrollTop
      const point = scrollMain + atMain
      let idx = cellIndexAt(cells, point)
      if (point > cells[idx].start + cells[idx].size && idx < cells.length - 1) idx++
      const cell = cells[idx]
      const offset = Math.min(1, Math.max(0, (point - contentStart(cell)) / contentMain(cell)))
      return { page: cell.pages[0], offset, crossFrac: (scrollCross + atCross) / crossTotal, viewMain: atMain, viewCross: atCross }
    },
    [cells, vertical, contentStart, contentMain, crossTotal],
  )

  const report = useCallback(() => {
    const el = scrollEl.current
    if (!el || !cells.length) return
    const main = vertical ? el.clientHeight : el.clientWidth
    const cross = vertical ? el.clientWidth : el.clientHeight
    const center = measure(main / 2, cross / 2)
    if (!center) return
    anchor.current = center
    const scrollMain = vertical ? el.scrollTop : el.scrollLeft
    const scrollSize = vertical ? el.scrollHeight : el.scrollWidth
    const reading = cells[cellIndexAt(cells, scrollMain + main * (paged ? 0.5 : READING_LINE))]
    const atEnd = scrollMain + main >= scrollSize - 4
    onScrollPosition({ page: center.page, offset: center.offset }, atEnd ? pageSizes.length : reading.pages[0])
  }, [cells, vertical, paged, measure, onScrollPosition, pageSizes.length])

  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = scrollEl.current
      if (!el) return
      setViewport((v) => ({ ...v, scroll: vertical ? el.scrollTop : el.scrollLeft }))
      report()
    })
  }

  // Keep the reader's place whenever the layout changes (zoom, layout mode, resize).
  useLayoutEffect(() => {
    const el = scrollEl.current
    if (!el || !cells.length || !viewport.width) return
    const a = anchor.current
    const cell = cells[cellOfPage.get(Math.min(a.page, pageSizes.length)) ?? 0]
    const main = vertical ? el.clientHeight : el.clientWidth
    const cross = vertical ? el.clientWidth : el.clientHeight
    const atMain = a.viewMain >= 0 ? a.viewMain : main / 2
    const atCross = a.viewCross >= 0 ? a.viewCross : cross / 2
    const targetMain = paged && a.viewMain < 0 && a.offset === 0 ? cell.start : contentStart(cell) + a.offset * contentMain(cell) - atMain
    const targetCross = a.crossFrac * crossTotal - atCross
    scrollWithoutSnap(el, vertical ? { top: targetMain, left: targetCross, behavior: 'instant' } : { left: targetMain, top: targetCross, behavior: 'instant' })
    setViewport((v) => ({ ...v, scroll: vertical ? el.scrollTop : el.scrollLeft }))
    report()
    // Let the pages at the new position mount before the opening transition takes its snapshot.
    setTimeout(() => screenReady('reader'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, crossTotal, viewport.width, viewport.height])

  // Measured synchronously as well as observed: resize observers don't fire while a screen transition is preparing.
  useLayoutEffect(() => {
    const el = scrollEl.current
    if (!el) return
    const measureViewport = () => {
      setViewport((v) => (v.width === el.clientWidth && v.height === el.clientHeight ? v : { ...v, height: el.clientHeight, width: el.clientWidth }))
      onResize(el.clientWidth, el.clientHeight)
    }
    measureViewport()
    const observer = new ResizeObserver(() => {
      // Keep whatever sat at the middle of the old viewport in the middle of the new one.
      anchor.current = { ...anchor.current, viewMain: -1, viewCross: -1 }
      measureViewport()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onResize])

  // Wheel: pinch / ctrl+wheel zooms around the cursor; paged modes turn whole pages per gesture and horizontal mode maps the wheel sideways.
  const wheelState = useRef({ acc: 0, lockedUntil: 0 })
  const latest = useRef({ measure, onPinchZoom, vertical, paged, cells })
  useEffect(() => {
    latest.current = { measure, onPinchZoom, vertical, paged, cells }
  })
  useEffect(() => {
    const el = scrollEl.current
    if (!el) return
    const zoomAround = (clientX: number, clientY: number, factor: number) => {
      const { measure, onPinchZoom, vertical } = latest.current
      const box = el.getBoundingClientRect()
      const atMain = vertical ? clientY - box.top : clientX - box.left
      const atCross = vertical ? clientX - box.left : clientY - box.top
      const a = measure(atMain, atCross)
      if (a) anchor.current = a
      onPinchZoom(factor)
    }
    const onWheel = (e: WheelEvent) => {
      const { vertical, paged, cells } = latest.current
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        // mouse wheels send ~100 per notch, trackpad pinches send small deltas
        const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
        zoomAround(e.clientX, e.clientY, Math.exp(-Math.max(-50, Math.min(50, delta)) * 0.0025))
        return
      }
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (vertical) {
        // Paged and vertical: step whole pages unless zoomed past the viewport, where native scroll pans.
        if (!paged) return
        const idx = cellIndexAt(cells, el.scrollTop + el.clientHeight / 2)
        if (cells[idx] && cells[idx].contentH > el.clientHeight + 1) return
      } else if (el.scrollHeight > el.clientHeight + 1 && !paged) return
      e.preventDefault()
      if (!paged) {
        el.scrollLeft += e.deltaY
        return
      }
      const state = wheelState.current
      if (Date.now() < state.lockedUntil) return
      state.acc += e.deltaY
      if (Math.abs(state.acc) < 40) return
      const pos = vertical ? el.scrollTop + el.clientHeight / 2 : el.scrollLeft + el.clientWidth / 2
      const idx = cellIndexAt(cells, pos)
      const next = cells[Math.max(0, Math.min(cells.length - 1, idx + Math.sign(state.acc)))]
      state.acc = 0
      state.lockedUntil = Date.now() + 450
      scrollWithoutSnap(el, vertical ? { top: next.start, behavior: 'smooth' } : { left: next.start, behavior: 'smooth' })
    }
    // Safari reports trackpad pinches as gesture events (with a cumulative scale) rather than ctrl+wheel.
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }
    let gestureScale = 1
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      gestureScale = 1
    }
    const onGestureChange = (e: Event) => {
      const g = e as GestureEvent
      e.preventDefault()
      if (!g.scale) return
      zoomAround(g.clientX, g.clientY, g.scale / gestureScale)
      gestureScale = g.scale
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(page, { smooth = true, offset } = {}) {
        const el = scrollEl.current
        const idx = cellOfPage.get(Math.max(1, Math.min(page, pageSizes.length)))
        if (!el || idx === undefined) return
        const cell = cells[idx]
        const main = vertical ? el.clientHeight : el.clientWidth
        let target: number
        if (offset !== undefined && vertical) target = contentStart(cell) + offset * cell.contentH - main * READING_LINE
        else if (paged) target = cell.start
        else target = cell.start - Math.min(gap, PAD) / 2 - 4
        const behavior = smooth ? 'smooth' : 'instant'
        scrollWithoutSnap(el, vertical ? { top: Math.max(0, target), behavior } : { left: Math.max(0, target), behavior })
      },
      anchorAt(clientX, clientY) {
        const el = scrollEl.current
        if (!el) return
        const box = el.getBoundingClientRect()
        const a = measure(vertical ? clientY - box.top : clientX - box.left, vertical ? clientX - box.left : clientY - box.top)
        if (a) anchor.current = a
      },
    }),
    [cells, cellOfPage, pageSizes.length, gap, vertical, paged, contentStart, measure],
  )

  const handleMouseUp = (e: React.MouseEvent) => {
    const container = scrollEl.current
    if (!container || e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-margin], [data-ribbon]')) return
    const selection = readSelection(container)
    if (selection) {
      onSelection(selection)
      return
    }
    onSelection(null)
    const pageEl = (e.target as HTMLElement).closest<HTMLElement>('[data-page]')
    if (!pageEl) return
    const page = Number(pageEl.dataset.page)
    const box = pageEl.getBoundingClientRect()
    const fx = (e.clientX - box.left) / box.width
    const fy = (e.clientY - box.top) / box.height
    const pad = 0.004
    const hit = highlightsByPage
      .get(page)
      ?.find((h) => h.rects.some((r) => fx >= r.x - pad && fx <= r.x + r.w + pad && fy >= r.y - pad && fy <= r.y + r.h + pad))
    if (hit) onHighlightClick(hit, { x: e.clientX, y: e.clientY + 8 })
  }

  const buffer = viewMain * 1.25
  const visible: Cell[] = []
  if (cells.length && viewMain) {
    for (let i = cellIndexAt(cells, viewport.scroll - buffer); i < cells.length && cells[i].start <= viewport.scroll + viewMain + buffer; i++) visible.push(cells[i])
  }

  return (
    <div
      ref={scrollEl}
      onScroll={onScroll}
      onMouseUp={handleMouseUp}
      data-page-mode={pageMode}
      className="relative h-full overflow-auto overscroll-contain outline-none"
      data-snap={paged ? (vertical ? 'y' : 'x') : undefined}
      tabIndex={-1}
    >
      <div className="relative" style={vertical ? { height: total, width: crossTotal } : { width: total, height: crossTotal }}>
        {visible.map((cell) => (
          <div
            key={cell.pages[0]}
            className="absolute flex items-center justify-center"
            style={{
              ...(vertical ? { top: cell.start, left: 0, height: cell.size, width: crossTotal } : { left: cell.start, top: 0, width: cell.size, height: crossTotal }),
              scrollSnapAlign: paged ? 'start' : undefined,
              scrollSnapStop: paged ? 'always' : undefined,
            }}
          >
            <div className="flex items-start" style={{ gap: FACING_GAP }}>
              {cell.pages.map((p, i) => {
                const size = pageSizes[p - 1]
                const side = cell.pages.length === 2 && i === 0 ? 'left' : 'right'
                const pageHighlights = highlightsByPage.get(p)
                const column = margins && (
                  <MarginColumn
                    side={side}
                    highlights={pageHighlights}
                    pageHeight={size.h * scale}
                    activeHighlightId={activeHighlightId}
                    onOpen={onHighlightClick}
                    onHover={onHighlightHover}
                  />
                )
                return (
                  <div key={p} className="flex items-start" style={{ gap: MARGIN_GAP }}>
                    {side === 'left' && column}
                    {margins && cell.pages.length === 1 && <div aria-hidden style={{ width: MARGIN_W }} className="shrink-0" />}
                    <PdfPage
                      pageNumber={p}
                      size={size}
                      scale={scale}
                      renderScale={renderScale}
                      pageMode={pageMode}
                      highlights={pageHighlights}
                      activeHighlightId={activeHighlightId}
                      textRenderer={textRenderer}
                      bookmarked={bookmarkedPages.has(p)}
                      onToggleBookmark={onToggleBookmark}
                    />
                    {side === 'right' && column}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const PdfPage = memo(function PdfPage({
  pageNumber,
  size,
  scale,
  renderScale,
  pageMode,
  highlights,
  activeHighlightId,
  textRenderer,
  bookmarked,
  onToggleBookmark,
}: {
  pageNumber: number
  size: PageSize
  scale: number
  renderScale: number
  pageMode: PageMode
  highlights?: Highlight[]
  activeHighlightId: string | null
  textRenderer?: (item: { str: string }) => string
  bookmarked: boolean
  onToggleBookmark: (page: number) => void
}) {
  // The page on screen stays at its last crisp render (stretched to the new size) until the next render finishes,
  // so zooming never flashes blank.
  const [shown, setShown] = useState(renderScale)
  const [painted, setPainted] = useState(false)
  const layers = shown === renderScale ? [shown] : [shown, renderScale]

  return (
    <div data-page={pageNumber} className="pdf-page group/page shadow-soft" style={{ width: size.w * scale, height: size.h * scale }}>
      {layers.map((layerScale) => (
        <div
          key={layerScale}
          className="page-layer"
          style={{
            width: size.w * layerScale,
            height: size.h * layerScale,
            transform: `scale(${scale / layerScale})`,
            opacity: layerScale === shown ? 1 : 0,
            pointerEvents: layerScale === shown ? undefined : 'none',
          }}
        >
          <Page
            pageNumber={pageNumber}
            scale={layerScale}
            loading={null}
            customTextRenderer={textRenderer}
            renderAnnotationLayer
            renderTextLayer
            onRenderSuccess={() => {
              setShown(layerScale)
              setPainted(true)
            }}
          />
        </div>
      ))}
      <div className="page-veil" data-painted={painted} />
      {pageMode === 'tint' && <div className="page-overlay page-tint" />}
      {pageMode === 'night' && (
        <>
          <div className="page-overlay page-night-ink" />
          <div className="page-overlay page-night-paper" />
        </>
      )}
      {highlights && (
        <div className="page-overlay highlight-layer">
          {highlights.flatMap((h) =>
            h.rects.map((r, i) => (
              <div
                key={`${h.id}-${i}`}
                className="highlight-rect"
                data-color={h.color}
                data-active={h.id === activeHighlightId}
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
              />
            )),
          )}
        </div>
      )}
      <button
        type="button"
        data-ribbon
        data-on={bookmarked}
        className="bookmark-ribbon"
        aria-label={bookmarked ? `Remove bookmark from page ${pageNumber}` : `Bookmark page ${pageNumber}`}
        title={bookmarked ? 'Bookmarked — click to remove' : 'Bookmark this page'}
        onClick={() => onToggleBookmark(pageNumber)}
      />
    </div>
  )
})

function MarginColumn({
  side,
  highlights,
  pageHeight,
  activeHighlightId,
  onOpen,
  onHover,
}: {
  side: 'left' | 'right'
  highlights?: Highlight[]
  pageHeight: number
  activeHighlightId: string | null
  onOpen: (highlight: Highlight, anchor: { x: number; y: number }) => void
  onHover: (id: string | null) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const items = useMemo(() => [...(highlights ?? [])].sort((a, b) => (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0)), [highlights])

  // Place each note beside its highlight, nudging later ones down so they never overlap.
  useLayoutEffect(() => {
    const cards = ref.current ? [...ref.current.children] as HTMLElement[] : []
    let bottom = -Infinity
    cards.forEach((card, i) => {
      const desired = (items[i]?.rects[0]?.y ?? 0) * pageHeight - 6
      const top = Math.max(desired, bottom + 10)
      card.style.top = `${top}px`
      bottom = top + card.offsetHeight
    })
  }, [items, pageHeight])

  return (
    <div ref={ref} data-margin className="relative shrink-0" style={{ width: MARGIN_W, height: pageHeight }}>
      {items.map((h) => (
        <button
          key={h.id}
          type="button"
          onMouseEnter={() => onHover(h.id)}
          onMouseLeave={() => onHover(null)}
          onClick={(e) => {
            const box = e.currentTarget.getBoundingClientRect()
            onOpen(h, { x: box.left + box.width / 2, y: box.bottom })
          }}
          className={`margin-note absolute inset-x-0 flex gap-2.5 rounded-md p-2.5 text-left transition ${side === 'left' ? 'flex-row-reverse text-right' : ''} ${
            activeHighlightId === h.id ? 'bg-surface shadow-soft' : 'hover:bg-surface/70'
          }`}
        >
          <span className="swatch w-1 shrink-0 self-stretch rounded-full" data-color={h.color} />
          <span className="min-w-0 flex-1">
            {h.note ? (
              <>
                <span className="line-clamp-5 font-display text-[0.82rem] leading-snug whitespace-pre-wrap text-ink">{h.note}</span>
                <span className="mt-1 line-clamp-1 text-[0.7rem] text-muted italic">“{h.text}”</span>
              </>
            ) : (
              <span className="line-clamp-3 font-display text-[0.78rem] leading-snug text-muted italic">“{h.text}”</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
