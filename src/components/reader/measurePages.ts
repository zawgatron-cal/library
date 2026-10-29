import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { PageSize } from './layout'

function viewportSize(page: PDFPageProxy) {
  const vp = page.getViewport({ scale: 1 })
  return { w: vp.width, h: vp.height }
}

/**
 * Find pages that aren't the size of page 1 (fold-outs, landscape tables, covers).
 * Most books have none, so the reader lays out with page 1's size first; this runs
 * afterwards in small batches. The result is saved for later opens.
 */
export async function measurePages(doc: PDFDocumentProxy, first: PageSize) {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const odd: Record<number, [number, number, number]> = {}
  try {
    for (let start = 2; start <= doc.numPages; start += 24) {
      const batch = Array.from({ length: Math.min(24, doc.numPages - start + 1) }, (_, i) => start + i)
      for (const page of await Promise.all(batch.map((n) => doc.getPage(n)))) {
        const { w, h } = viewportSize(page)
        if (Math.abs(w - first.w) > 0.5 || Math.abs(h - first.h) > 0.5 || page.rotate !== first.rotate) {
          odd[page.pageNumber] = [w, h, page.rotate]
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  } catch {
    return null
  }
  return odd
}

export { viewportSize }
