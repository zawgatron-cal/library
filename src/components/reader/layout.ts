import type { PageLayout, ScrollDirection } from '../../lib/preferences'

/**
 * A page's size in PDF points as displayed, plus the rotation the PDF itself gives it. `fit` is how far the page
 * has been scaled down from its true size to sit among its neighbours.
 */
export type PageSize = { w: number; h: number; rotate?: number; fit?: number }

export type Cell = { pages: number[]; start: number; size: number; contentW: number; contentH: number }

export const PAD = 36
export const FACING_GAP = 2
export const MARGIN_W = 248
export const MARGIN_GAP = 18
const MAX_FIT_WIDTH = 980
/** Where along the viewport (0 = start) a page has to reach to count as "the current page" while scrolling freely. */
export const READING_LINE = 0.35

export type LayoutOptions = { layout: PageLayout; direction: ScrollDirection; margins: boolean }

function groupPages(count: number, layout: PageLayout) {
  const groups: number[][] = []
  if (layout === 'double') {
    groups.push([1])
    for (let p = 2; p <= count; p += 2) groups.push(p + 1 <= count ? [p, p + 1] : [p])
  } else {
    for (let p = 1; p <= count; p++) groups.push([p])
  }
  return groups
}

// Margins sit on both sides, even for a single page (one side empty), so the page itself stays centred.
const marginsWidth = (margins: boolean) => (margins ? 2 * (MARGIN_W + MARGIN_GAP) : 0)

/** Scale that fits a typical page (or spread) into the viewport for the given layout. */
export function fitScale(sizes: PageSize[], { layout, direction, margins }: LayoutOptions, viewW: number, viewH: number) {
  if (!sizes.length || !viewW || !viewH) return 1
  const sample = sizes.slice(0, 12)
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]
  const w = median(sample.map((s) => s.w))
  const h = median(sample.map((s) => s.h))
  const pages = layout === 'double' ? 2 : 1
  const fixed = marginsWidth(margins) + FACING_GAP * (pages - 1)
  const availW = viewW - PAD * 2 - fixed
  const availH = viewH - PAD * 2
  let scale: number
  if (layout === 'continuous' && direction === 'vertical') scale = Math.min(availW, MAX_FIT_WIDTH) / w
  else if (layout === 'continuous') scale = availH / h
  else scale = Math.min(availW / (w * pages), availH / h)
  return Math.min(4, Math.max(0.2, scale))
}

export function buildLayout(sizes: PageSize[], scale: number, opts: LayoutOptions, gap: number, viewMain: number, viewCross: number) {
  const vertical = opts.direction === 'vertical'
  const paged = opts.layout !== 'continuous'
  const cells: Cell[] = []
  let pos = paged ? 0 : PAD
  let maxCross = 0
  for (const pages of groupPages(sizes.length, opts.layout)) {
    const contentW =
      pages.reduce((sum, p) => sum + sizes[p - 1].w * scale, 0) + FACING_GAP * (pages.length - 1) + marginsWidth(opts.margins)
    const contentH = Math.max(...pages.map((p) => sizes[p - 1].h * scale))
    const main = vertical ? contentH : contentW
    const size = paged ? Math.max(viewMain, main + PAD * 2) : main
    cells.push({ pages, start: pos, size, contentW, contentH })
    pos += size + (paged ? 0 : gap)
    maxCross = Math.max(maxCross, vertical ? contentW : contentH)
  }
  return { cells, total: paged ? pos : pos - gap + PAD, crossTotal: Math.max(viewCross, maxCross + PAD * 2) }
}

export function cellIndexAt(cells: Cell[], pos: number) {
  let lo = 0
  let hi = cells.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cells[mid].start <= pos) lo = mid
    else hi = mid - 1
  }
  return lo
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
