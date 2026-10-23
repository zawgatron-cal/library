import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Page } from 'react-pdf'
import { Columns2, Columns3, RotateCw } from 'lucide-react'
import type { Book, Highlight } from '../../lib/db'
import { useLocalStorage } from '../../lib/hooks'
import { useSettings } from '../../lib/settings'
import type { PageMode } from '../../lib/themes'
import { IconButton } from '../ui/primitives'
import type { PageSize } from './layout'

type Props = {
  pdf: PDFDocumentProxy | null
  book: Book
  highlights: Highlight[]
  currentPage: number
  pageSizes: PageSize[] | null
  pageLabels: string[] | null
  rotations: number[]
  onJump: (page: number) => void
  onRotatePage: (page: number) => void
}

const GAP = 14

/** A grid of page thumbnails for skimming; only the ones near the visible part of the list are rendered. */
export function PagesPanel({ pdf, book, highlights, currentPage, pageSizes, pageLabels, rotations, onJump, onRotatePage }: Props) {
  const { pageMode } = useSettings()
  const [prefs, setPrefs] = useLocalStorage('library:pages-panel', { columns: 2 })
  const columns = prefs.columns === 3 ? 3 : 2
  const grid = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [near, setNear] = useState<Set<number>>(() => new Set())
  const [painted, setPainted] = useState<Set<number>>(() => new Set())

  const pageCount = pageSizes?.length ?? book.pageCount
  const bookmarked = useMemo(() => new Set(book.bookmarks.map((b) => b.page)), [book.bookmarks])
  const annotationCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const h of highlights) counts.set(h.page, (counts.get(h.page) ?? 0) + 1)
    return counts
  }, [highlights])

  useEffect(() => {
    const el = grid.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const tileW = width ? Math.floor((width - GAP * (columns - 1)) / columns) : 0

  useEffect(() => {
    const el = grid.current
    const root = el?.closest<HTMLElement>('[data-sidebar-scroll]')
    if (!el || !root || !tileW) return
    const observer = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev)
          for (const entry of entries) {
            const page = Number((entry.target as HTMLElement).dataset.thumb)
            if (entry.isIntersecting) next.add(page)
            else next.delete(page)
          }
          return next
        })
        const left = entries.filter((e) => !e.isIntersecting).map((e) => Number((e.target as HTMLElement).dataset.thumb))
        if (left.length)
          setPainted((prev) => {
            const next = new Set(prev)
            left.forEach((page) => next.delete(page))
            return next
          })
      },
      { root, rootMargin: '600px 0px' },
    )
    el.querySelectorAll('[data-thumb]').forEach((tile) => observer.observe(tile))
    return () => observer.disconnect()
  }, [tileW, pageCount])

  // Thumbnails draw a couple at a time, nearest the current page first. Drawing them all at once would stall the
  // reader for a moment every time the panel opens or scrolls.
  const rendering = useMemo(() => {
    const waiting = [...near].filter((p) => !painted.has(p)).sort((a, b) => Math.abs(a - currentPage) - Math.abs(b - currentPage))
    return new Set([...[...near].filter((p) => painted.has(p)), ...waiting.slice(0, 2)])
  }, [near, painted, currentPage])
  const onPainted = useCallback((page: number) => setPainted((prev) => new Set(prev).add(page)), [])

  // Keep the page being read in view as you read; scrolling the grid yourself is left alone.
  const firstScroll = useRef(true)
  useEffect(() => {
    const tile = grid.current?.querySelector<HTMLElement>(`[data-thumb="${currentPage}"]`)
    if (!tile || !tileW) return
    tile.scrollIntoView({ block: firstScroll.current ? 'center' : 'nearest', behavior: firstScroll.current ? 'instant' : 'smooth' })
    firstScroll.current = false
  }, [currentPage, tileW])

  return (
    <div className="px-4 pb-6">
      <div className="flex items-center justify-between px-1 pt-4 pb-3">
        <h3 className="font-display text-lg font-medium">Pages</h3>
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted tabular-nums">{pageCount}</span>
          <IconButton label={columns === 2 ? 'Smaller thumbnails' : 'Larger thumbnails'} onClick={() => setPrefs({ columns: columns === 2 ? 3 : 2 })}>
            {columns === 2 ? <Columns3 /> : <Columns2 />}
          </IconButton>
        </div>
      </div>
      <div ref={grid} className="grid items-end" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: GAP, rowGap: GAP + 4 }}>
        {tileW > 0 &&
          Array.from({ length: pageCount }, (_, i) => {
            const page = i + 1
            const size = pageSizes?.[i] ?? pageSizes?.[0] ?? { w: 3, h: 4 }
            return (
              <Thumb
                key={page}
                pdf={pdf}
                page={page}
                width={tileW}
                height={Math.round((tileW * size.h) / size.w)}
                rotate={((size.rotate ?? 0) + (rotations[i] ?? 0)) % 360}
                render={rendering.has(page)}
                onPainted={onPainted}
                current={page === currentPage}
                bookmarked={bookmarked.has(page)}
                annotations={annotationCounts.get(page) ?? 0}
                label={pageLabels?.[i] ?? String(page)}
                pageMode={pageMode}
                onJump={onJump}
                onRotate={onRotatePage}
              />
            )
          })}
      </div>
    </div>
  )
}

const Thumb = memo(function Thumb({
  pdf,
  page,
  width,
  height,
  render,
  current,
  bookmarked,
  annotations,
  label,
  pageMode,
  rotate,
  onJump,
  onRotate,
  onPainted,
}: {
  pdf: PDFDocumentProxy | null
  page: number
  width: number
  height: number
  render: boolean
  current: boolean
  bookmarked: boolean
  annotations: number
  label: string
  pageMode: PageMode
  rotate: number
  onJump: (page: number) => void
  onRotate: (page: number) => void
  onPainted: (page: number) => void
}) {
  const [painted, setPainted] = useState(false)
  return (
    <div data-thumb={page} className="group relative flex flex-col items-center gap-1.5 text-center">
      <button
        type="button"
        onClick={() => onJump(page)}
        aria-label={`Page ${label}`}
        aria-current={current ? 'page' : undefined}
        className="absolute inset-0 z-[5] rounded-[3px]"
      />
      <div
        className={`pdf-page overflow-hidden rounded-[3px] shadow-soft transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lifted ${
          current ? 'outline-2 outline-offset-2 outline-accent' : ''
        }`}
        style={{ width, height }}
      >
        {render && pdf && (
          <Page
            pdf={pdf}
            pageNumber={page}
            width={width}
            rotate={rotate}
            loading={null}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onRenderSuccess={() => {
              setPainted(true)
              onPainted(page)
            }}
            onRenderError={() => onPainted(page)}
          />
        )}
        <div className="page-veil" data-painted={render && painted} />
        {pageMode === 'tint' && <div className="page-overlay page-tint" />}
        {pageMode === 'night' && (
          <>
            <div className="page-overlay page-night-ink" />
            <div className="page-overlay page-night-paper" />
          </>
        )}
        {bookmarked && <div className="bookmark-ribbon thumb-ribbon" data-on="true" />}
        {annotations > 0 && (
          <span className="absolute right-1 bottom-1 z-[3] rounded-full bg-accent px-1.5 text-[0.62rem] leading-4 font-semibold text-on-accent tabular-nums">
            {annotations}
          </span>
        )}
      </div>
      <span className={`text-[0.7rem] tabular-nums ${current ? 'font-semibold text-accent' : 'text-muted'}`}>{label}</span>
      <button type="button" className="page-rotate thumb-rotate z-[6]" aria-label={`Rotate page ${label}`} title="Rotate this page" onClick={() => onRotate(page)}>
        <RotateCw />
      </button>
    </div>
  )
})
