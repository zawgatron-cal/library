import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Page } from 'react-pdf'
import type { Highlight, ReadingPosition, Rect } from '../../lib/db'
import { escapeHtml, escapeRegExp } from '../../lib/format'
import type { PageMode } from '../../lib/themes'

export type PageSize = { w: number; h: number }

export type SelectionPart = { page: number; rects: Rect[] }
export type PendingSelection = { parts: SelectionPart[]; text: string; anchor: { x: number; y: number } }

export type PageStackHandle = {
  scrollToPage: (page: number, options?: { smooth?: boolean; offset?: number }) => void
  scrollBy: (dy: number) => void
}

type Row = { pages: number[]; top: number; height: number; width: number }

const PAD_Y = 36
const PAD_X = 32
const FACING_GAP = 2
/** Where in the viewport (0 = top) a page has to reach to count as "the current page". */
const READING_LINE = 0.35
/** Saved positions are measured this far below the viewport top, clear of scroll rounding and page gaps. */
const POSITION_ANCHOR = 24

function buildRows(sizes: PageSize[], scale: number, spread: boolean, gap: number) {
  const groups: number[][] = []
  if (spread) {
    groups.push([1])
    for (let p = 2; p <= sizes.length; p += 2) groups.push(p + 1 <= sizes.length ? [p, p + 1] : [p])
  } else {
    for (let p = 1; p <= sizes.length; p++) groups.push([p])
  }

  const rows: Row[] = []
  let top = PAD_Y
  for (const pages of groups) {
    const width = pages.reduce((sum, p) => sum + sizes[p - 1].w * scale, 0) + FACING_GAP * (pages.length - 1)
    const height = Math.max(...pages.map((p) => sizes[p - 1].h * scale))
    rows.push({ pages, top, height, width })
    top += height + gap
  }
  return { rows, totalHeight: top - gap + PAD_Y, maxWidth: Math.max(0, ...rows.map((r) => r.width)) }
}

function rowIndexAt(rows: Row[], y: number) {
  let lo = 0
  let hi = rows.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (rows[mid].top <= y) lo = mid
    else hi = mid - 1
  }
  return lo
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

  const pageEls = [...container.querySelectorAll<HTMLElement>('[data-page]')]
  const pageBoxes = pageEls.map((el) => ({ page: Number(el.dataset.page), box: el.getBoundingClientRect() }))
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

type Props = {
  pageSizes: PageSize[]
  scale: number
  spread: boolean
  gap: number
  pageMode: PageMode
  initialPosition: ReadingPosition | null
  highlights: Highlight[]
  activeHighlightId: string | null
  searchQuery: string
  onScrollPosition: (position: ReadingPosition, currentPage: number) => void
  onResize: (width: number) => void
  onSelection: (selection: PendingSelection | null) => void
  onHighlightClick: (highlight: Highlight, anchor: { x: number; y: number }) => void
  ref?: Ref<PageStackHandle>
}

export function PageStack({
  pageSizes,
  scale,
  spread,
  gap,
  pageMode,
  initialPosition,
  highlights,
  activeHighlightId,
  searchQuery,
  onScrollPosition,
  onResize,
  onSelection,
  onHighlightClick,
  ref,
}: Props) {
  const scrollEl = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 800, width: 800 })
  const positionRef = useRef<ReadingPosition>(initialPosition ?? { page: 1, offset: 0 })
  const frame = useRef(0)

  const { rows, totalHeight, maxWidth } = useMemo(() => buildRows(pageSizes, scale, spread, gap), [pageSizes, scale, spread, gap])
  const rowOfPage = useMemo(() => {
    const map = new Map<number, number>()
    rows.forEach((row, i) => row.pages.forEach((p) => map.set(p, i)))
    return map
  }, [rows])

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

  const report = useCallback(() => {
    const el = scrollEl.current
    if (!el || !rows.length) return
    const top = el.scrollTop
    const anchor = top + POSITION_ANCHOR
    let rowIdx = rowIndexAt(rows, anchor)
    if (anchor > rows[rowIdx].top + rows[rowIdx].height && rowIdx < rows.length - 1) rowIdx++
    const row = rows[rowIdx]
    const position = { page: row.pages[0], offset: Math.min(1, Math.max(0, (anchor - row.top) / row.height)) }
    positionRef.current = position
    const readingRow = rows[rowIndexAt(rows, top + el.clientHeight * READING_LINE)]
    const atEnd = top + el.clientHeight >= el.scrollHeight - 4
    onScrollPosition(position, atEnd ? pageSizes.length : readingRow.pages[0])
  }, [rows, onScrollPosition, pageSizes.length])

  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = scrollEl.current
      if (!el) return
      setViewport((v) => ({ ...v, top: el.scrollTop }))
      report()
    })
  }

  // Keep the reader's place whenever the layout changes (zoom, spread, resize).
  useLayoutEffect(() => {
    const el = scrollEl.current
    if (!el || !rows.length) return
    const { page, offset } = positionRef.current
    const row = rows[rowOfPage.get(Math.min(page, pageSizes.length)) ?? 0]
    el.scrollTop = row.top + offset * row.height - POSITION_ANCHOR
    setViewport((v) => ({ ...v, top: el.scrollTop }))
    report()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  useEffect(() => {
    const el = scrollEl.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setViewport((v) => ({ ...v, height: el.clientHeight, width: el.clientWidth }))
      onResize(el.clientWidth)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onResize])

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(page, { smooth = true, offset = 0 } = {}) {
        const el = scrollEl.current
        const idx = rowOfPage.get(Math.max(1, Math.min(page, pageSizes.length)))
        if (!el || idx === undefined) return
        const row = rows[idx]
        const top = offset ? row.top + offset * row.height - el.clientHeight * READING_LINE : row.top - Math.min(gap, PAD_Y) / 2 - 4
        el.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
      },
      scrollBy(dy) {
        scrollEl.current?.scrollBy({ top: dy, behavior: 'smooth' })
      },
    }),
    [rows, rowOfPage, pageSizes.length, gap],
  )

  const handleMouseUp = (e: React.MouseEvent) => {
    const container = scrollEl.current
    if (!container || e.button !== 0) return
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

  const buffer = viewport.height * 1.25
  const visibleRows: Row[] = []
  if (rows.length) {
    for (let i = rowIndexAt(rows, viewport.top - buffer); i < rows.length && rows[i].top <= viewport.top + viewport.height + buffer; i++) {
      visibleRows.push(rows[i])
    }
  }
  const innerWidth = Math.max(viewport.width, maxWidth + PAD_X * 2)

  return (
    <div ref={scrollEl} onScroll={onScroll} onMouseUp={handleMouseUp} data-page-mode={pageMode} className="relative h-full overflow-auto outline-none" tabIndex={-1}>
      <div className="relative" style={{ height: totalHeight, width: innerWidth }}>
        {visibleRows.map((row) => (
          <div key={row.pages[0]} className="absolute flex" style={{ top: row.top, left: (innerWidth - row.width) / 2, gap: FACING_GAP }}>
            {row.pages.map((p) => (
              <PdfPage
                key={p}
                pageNumber={p}
                size={pageSizes[p - 1]}
                scale={scale}
                pageMode={pageMode}
                highlights={highlightsByPage.get(p)}
                activeHighlightId={activeHighlightId}
                textRenderer={textRenderer}
              />
            ))}
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
  pageMode,
  highlights,
  activeHighlightId,
  textRenderer,
}: {
  pageNumber: number
  size: PageSize
  scale: number
  pageMode: PageMode
  highlights?: Highlight[]
  activeHighlightId: string | null
  textRenderer?: (item: { str: string }) => string
}) {
  return (
    <div data-page={pageNumber} className="pdf-page shadow-soft" style={{ width: size.w * scale, height: size.h * scale }}>
      <Page pageNumber={pageNumber} scale={scale} loading={null} customTextRenderer={textRenderer} renderAnnotationLayer renderTextLayer>
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
      </Page>
    </div>
  )
})
