import type { Rect } from '../../lib/db'

export type SelectionPart = { page: number; rects: Rect[] }
export type PendingSelection = { parts: SelectionPart[]; text: string; anchor: { x: number; y: number } }

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

export function readSelection(container: HTMLElement): PendingSelection | null {
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
    if (rect.h > 0.12 || rect.w > 0.98) continue
    if (!byPage.has(hit.page)) byPage.set(hit.page, [])
    byPage.get(hit.page)!.push(rect)
  }

  const parts = [...byPage.entries()].map(([page, rects]) => ({ page, rects: mergeRects(rects) })).filter((p) => p.rects.length)
  if (!parts.length) return null
  const last = [...range.getClientRects()].filter((r) => r.width > 0).at(-1) ?? range.getBoundingClientRect()
  return { parts, text, anchor: { x: last.right, y: last.bottom } }
}

/** Pause scroll-snap so programmatic jumps are not halted at the next page. */
export function scrollWithoutSnap(el: HTMLElement, options: ScrollToOptions) {
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
