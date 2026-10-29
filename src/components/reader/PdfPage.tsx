import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Page } from 'react-pdf'
import type { Highlight, OcrPage } from '../../lib/db'
import type { PageMode } from '../../lib/themes'
import { OcrLayer } from './OcrLayer'
import { MARGIN_W, type PageSize } from './layout'

export const PdfPage = memo(function PdfPage({
  pageNumber,
  size,
  scale,
  renderScale,
  pageMode,
  highlights,
  activeHighlightId,
  textRenderer,
  rotate,
  extraRotation,
  ocr,
  searchQuery,
  bookmarked,
  onToggleBookmark,
}: {
  pageNumber: number
  size: PageSize
  scale: number
  /** The scale to draw at; null holds off drawing for now. */
  renderScale: number | null
  pageMode: PageMode
  highlights?: Highlight[]
  activeHighlightId: string | null
  textRenderer?: (item: { str: string }) => string
  rotate: number
  extraRotation: number
  ocr?: OcrPage
  searchQuery: string
  bookmarked: boolean
  onToggleBookmark: (page: number) => void
}) {
  const turned = extraRotation % 180 !== 0
  // The page on screen stays at its last crisp render (stretched to the new size) until the next render finishes,
  // so zooming never flashes blank.
  const [shown, setShown] = useState<number | null>(null)
  const [painted, setPainted] = useState(false)
  const layers = [...new Set([shown, renderScale])].filter((s): s is number => s !== null)

  return (
    <div data-page={pageNumber} className="pdf-page group/page shadow-soft" style={{ width: size.w * scale, height: size.h * scale }}>
      {layers.map((layerScale) => (
        <div
          key={layerScale}
          className="page-layer"
          style={{
            width: size.w * layerScale,
            height: size.h * layerScale,
            // Avoid an identity transform: Chrome then fails to clip ::selection to the page.
            transform: scale === layerScale ? undefined : `scale(${scale / layerScale})`,
            opacity: layerScale === shown || shown === null ? 1 : 0,
            pointerEvents: layerScale === shown || shown === null ? undefined : 'none',
          }}
        >
          <Page
            pageNumber={pageNumber}
            scale={layerScale * (size.fit ?? 1)}
            rotate={rotate}
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
      {ocr && (
        <OcrLayer
          ocr={ocr}
          width={(turned ? size.h : size.w) * scale}
          height={(turned ? size.w : size.h) * scale}
          rotation={extraRotation}
          query={searchQuery}
        />
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

export function MarginColumn({
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
