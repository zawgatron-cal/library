import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { Highlight, OcrPage, ReadingPosition } from '../../lib/db'
import { rotateRect, unrotateRect } from '../../lib/geometry'
import { escapeHtml, escapeRegExp } from '../../lib/format'
import type { PageLayout, ScrollDirection } from '../../lib/preferences'
import type { PageMode } from '../../lib/themes'
import { screenReady } from '../../lib/router'
import { FACING_GAP, MARGIN_GAP, MARGIN_W, PAD, READING_LINE, buildLayout, cellIndexAt, type Cell, type PageSize } from './layout'
import { PdfPage, MarginColumn } from './PdfPage'
import { readSelection, scrollWithoutSnap, type PendingSelection } from './selection'

export type { PendingSelection, SelectionPart } from './selection'

export type PageStackHandle = {
  scrollToPage: (page: number, options?: { smooth?: boolean; offset?: number }) => void
  /** Smoothly nudge the reading surface by a fraction of the viewport (−1 = up/back, +1 = down/forward). */
  scrollByViewport: (fraction: number) => void
  /** Keep the content under this viewport point fixed through the next layout change (e.g. zoom). */
  anchorAt: (clientX: number, clientY: number) => void
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
  /** Extra clockwise rotation the reader applies to each page (index = page - 1). */
  rotations: number[]
  ocrPages: ReadonlyMap<number, OcrPage>
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
  /** Fired for user-driven scrolling (wheel, trackpad, scrollbar) — not programmatic jumps. */
  onUserScroll?: () => void
  ref?: Ref<PageStackHandle>
}

export function PageStack(props: Props) {
  const { pageSizes, scale, layout, direction, margins, gap, pageMode, initialPosition, highlights, rotations, ocrPages, activeHighlightId, bookmarkedPages, searchQuery } = props
  const { onScrollPosition, onResize, onSelection, onHighlightClick, onHighlightHover, onToggleBookmark, onPinchZoom, onUserScroll, ref } = props
  const vertical = direction === 'vertical'
  const paged = layout !== 'continuous'

  const scrollEl = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ scroll: 0, width: 0, height: 0 })
  const anchor = useRef<Anchor>({ page: initialPosition?.page ?? 1, offset: initialPosition?.offset ?? 0, crossFrac: 0.5, viewMain: -1, viewCross: -1 })
  const frame = useRef(0)
  /** >0 while we scroll from code (jump / layout / keyboard nudge) so onUserScroll stays quiet. */
  const programmaticScroll = useRef(0)
  const renderScale = useDebounced(scale, 220)
  // Pages kept ready just off screen draw a little after the ones in view, so those come first.
  const [nearbyScale, setNearbyScale] = useState<number | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setNearbyScale(renderScale), 450)
    return () => clearTimeout(timer)
  }, [renderScale])

  const viewMain = vertical ? viewport.height : viewport.width
  const viewCross = vertical ? viewport.width : viewport.height
  const opts = useMemo(() => ({ layout, direction, margins }), [layout, direction, margins])
  const { cells, total, crossTotal } = useMemo(() => buildLayout(pageSizes, scale, opts, gap, viewMain, viewCross), [pageSizes, scale, opts, gap, viewMain, viewCross])
  const cellOfPage = useMemo(() => {
    const map = new Map<number, number>()
    cells.forEach((cell, i) => cell.pages.forEach((p) => map.set(p, i)))
    return map
  }, [cells])

  // Highlights are stored against the unrotated page; these are turned to match the page as shown.
  const highlightsByPage = useMemo(() => {
    const map = new Map<number, Highlight[]>()
    for (const h of highlights) {
      const rotation = rotations[h.page - 1] ?? 0
      const shown = rotation ? { ...h, rects: h.rects.map((r) => rotateRect(r, rotation)) } : h
      if (!map.has(h.page)) map.set(h.page, [])
      map.get(h.page)!.push(shown)
    }
    return map
  }, [highlights, rotations])
  const original = useMemo(() => new Map(highlights.map((h) => [h.id, h])), [highlights])
  const openHighlight = useCallback(
    (h: Highlight, at: { x: number; y: number }) => onHighlightClick(original.get(h.id) ?? h, at),
    [original, onHighlightClick],
  )

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
      if (programmaticScroll.current === 0) onUserScroll?.()
    })
  }

  const runProgrammaticScroll = (fn: () => void) => {
    programmaticScroll.current++
    fn()
    requestAnimationFrame(() => {
      programmaticScroll.current = Math.max(0, programmaticScroll.current - 1)
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
    runProgrammaticScroll(() => {
      scrollWithoutSnap(el, vertical ? { top: targetMain, left: targetCross, behavior: 'instant' } : { left: targetMain, top: targetCross, behavior: 'instant' })
    })
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
        runProgrammaticScroll(() => {
          scrollWithoutSnap(el, vertical ? { top: Math.max(0, target), behavior } : { left: Math.max(0, target), behavior })
        })
      },
      scrollByViewport(fraction) {
        const el = scrollEl.current
        if (!el) return
        const span = (vertical ? el.clientHeight : el.clientWidth) * fraction
        runProgrammaticScroll(() => {
          scrollWithoutSnap(
            el,
            vertical ? { top: el.scrollTop + span, behavior: 'smooth' } : { left: el.scrollLeft + span, behavior: 'smooth' },
          )
        })
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
      const parts = selection.parts.map((part) => ({ ...part, rects: part.rects.map((r) => unrotateRect(r, rotations[part.page - 1] ?? 0)) }))
      onSelection({ ...selection, parts })
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
    if (hit) openHighlight(hit, { x: e.clientX, y: e.clientY + 8 })
  }

  const buffer = viewMain * 1.25
  const visible: Cell[] = []
  if (cells.length && viewMain) {
    for (let i = cellIndexAt(cells, viewport.scroll - buffer); i < cells.length && cells[i].start <= viewport.scroll + viewMain + buffer; i++) visible.push(cells[i])
  }
  const inView = new Set(visible.filter((c) => c.start < viewport.scroll + viewMain && c.start + c.size > viewport.scroll).flatMap((c) => c.pages))

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
                    onOpen={openHighlight}
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
                      renderScale={inView.has(p) ? renderScale : nearbyScale}
                      pageMode={pageMode}
                      highlights={pageHighlights}
                      activeHighlightId={activeHighlightId}
                      textRenderer={textRenderer}
                      rotate={((size.rotate ?? 0) + (rotations[p - 1] ?? 0)) % 360}
                      extraRotation={rotations[p - 1] ?? 0}
                      ocr={ocrPages.get(p)}
                      searchQuery={searchQuery}
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
