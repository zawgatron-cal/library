import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { OcrPage, OutlineEntry } from './db'
import { rotateRect } from './geometry'
import { pdfjs } from './pdf'

/*
  Builds a table of contents for PDFs that don't come with one, from the text the reader can already see: the
  PDF's own text layer, or the recognised text of scanned pages. Headings are lines set noticeably larger than
  the body text, or that look like headings ("Chapter 3", "Lecture 4: …", "2.1 Methods"). Lines repeated on many
  pages are treated as running headers and footers and left out.
*/

type Line = { page: number; text: string; size: number; top: number; pageHeight: number; ocr: boolean }

const KEYWORD = /^(chapter|lecture|part|section|unit|lesson|module|appendix|week|topic|book)(\s+(\d+|[ivxlc]+|[a-z])\b|\s*$)/i
const NUMBERED = /^(\d+(?:\.\d+)*)\.?\s+\p{Lu}/u
const MAX_PER_PAGE = 4

async function textLines(pdf: PDFDocumentProxy, n: number): Promise<Line[]> {
  const page = await pdf.getPage(n)
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  const lines: Line[] = []
  let current: { parts: string[]; y: number; size: number } | null = null
  const flush = () => {
    const text = current?.parts.join('').replace(/\s+/g, ' ').trim()
    if (current && text) lines.push({ page: n, text, size: current.size, top: current.y / viewport.height, pageHeight: viewport.height, ocr: false })
    current = null
  }
  for (const item of content.items) {
    if (!('str' in item)) continue
    const t = pdfjs.Util.transform(viewport.transform, item.transform)
    const size = Math.hypot(t[2], t[3])
    const y = t[5]
    if (item.str.trim()) {
      if (current && Math.abs(y - current.y) > Math.max(size, current.size) * 0.5) flush()
      current ??= { parts: [], y, size: 0 }
      current.size = Math.max(current.size, size)
      current.parts.push(item.str)
    } else {
      current?.parts.push(' ')
    }
    if (item.hasEOL) flush()
  }
  flush()
  return lines
}

async function ocrLines(pdf: PDFDocumentProxy, ocr: OcrPage): Promise<Line[]> {
  const page = await pdf.getPage(ocr.page)
  const viewport = page.getViewport({ scale: 1, rotation: page.rotate + ocr.rotation })
  return ocr.lines.map((line) => {
    const box = rotateRect(line.box, ocr.rotation)
    return {
      page: ocr.page,
      text: line.words.map((w) => w.text).join(' '),
      // Line boxes stretch with descenders, so prefer Tesseract's own row height; scaled, either is close to the type size.
      size: (line.size ? line.size : box.h * 0.75) * viewport.height,
      top: box.y,
      pageHeight: viewport.height,
      ocr: true,
    }
  })
}

const normalize = (text: string) => text.toLowerCase().replace(/[\d\s.,:;|·•–—-]+/g, ' ').trim()
const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length

function plausible(line: Line) {
  const { text } = line
  const words = text.split(' ').length
  if (text.length < 3 || text.length > 100 || words > 14) return false
  if (letters(text) < Math.max(2, text.replace(/\s/g, '').length * 0.5)) return false
  if (/[,;]$/.test(text) || /^(page|p\.)\s*\d+/i.test(text) || /^\d+\s*(of|\/)\s*\d+$/.test(text)) return false
  return true
}

/** The size most of the text is set in, weighted by how much text uses it. */
function bodySize(lines: Line[]) {
  const weight = new Map<number, number>()
  for (const l of lines) {
    const bucket = Math.round(l.size * 2) / 2
    weight.set(bucket, (weight.get(bucket) ?? 0) + l.text.length)
  }
  let best = 0
  let most = -1
  for (const [size, w] of weight) if (w > most) [best, most] = [size, w]
  return best
}

export async function generateOutline(
  pdf: PDFDocumentProxy,
  ocrPages: ReadonlyMap<number, OcrPage>,
  onProgress?: (fraction: number) => void,
  signal?: { cancelled: boolean },
): Promise<OutlineEntry[]> {
  onProgress?.(0)
  const lines: Line[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    if (signal?.cancelled) return []
    const own = await textLines(pdf, n).catch(() => [])
    const ocr = ocrPages.get(n)
    const ownLength = own.reduce((sum, l) => sum + l.text.length, 0)
    lines.push(...(ocr && ownLength < 25 ? await ocrLines(pdf, ocr) : own))
    if (n % 20 === 0) onProgress?.(n / pdf.numPages)
  }
  if (!lines.length) return []

  const pagesWith = new Map<string, Set<number>>()
  for (const l of lines) {
    const key = normalize(l.text)
    if (!key) continue
    if (!pagesWith.has(key)) pagesWith.set(key, new Set())
    pagesWith.get(key)!.add(l.page)
  }
  const repeatLimit = Math.max(3, pdf.numPages * 0.25)
  const running = (l: Line) => (pagesWith.get(normalize(l.text))?.size ?? 0) >= repeatLimit

  const textBody = bodySize(lines.filter((l) => !l.ocr))
  const ocrBody = bodySize(lines.filter((l) => l.ocr))
  const ratio = (l: Line) => l.size / ((l.ocr ? ocrBody : textBody) || l.size)

  type Candidate = Line & { depth: number | null; keyword: boolean }
  const candidates: Candidate[] = []
  for (const l of lines) {
    if (!plausible(l) || running(l)) continue
    const r = ratio(l)
    const short = l.text.split(' ').length <= 8 && !/\.$/.test(l.text)
    const keyword = KEYWORD.test(l.text) && r >= 0.95 && short
    const numbered = NUMBERED.exec(l.text)
    const big = r >= (l.ocr ? 1.22 : 1.18) && /^[\p{Lu}\d]/u.test(l.text) && (short || r >= 1.5)
    // Recognised line heights swing with ascenders and descenders, so a numbered heading in a scan can measure no
    // larger than the text around it; its numbering and shortness have to carry it.
    const numberedHeading = numbered && short && numbered[1].split('.').every((part) => Number(part) <= 50) && (l.ocr || r >= 1.08)
    if (keyword || big || numberedHeading) {
      candidates.push({ ...l, keyword, depth: numbered ? numbered[1].split('.').length - 1 : null })
    }
  }

  // Headings that wrap onto a second line arrive as two lines of the same size, one under the other.
  const merged: Candidate[] = []
  for (const c of candidates) {
    const prev = merged.at(-1)
    if (
      prev &&
      prev.page === c.page &&
      Math.abs(prev.size - c.size) < prev.size * 0.08 &&
      (c.top - prev.top) * c.pageHeight < c.size * 2.2 &&
      c.top > prev.top &&
      c.depth === null &&
      !c.keyword
    ) {
      prev.text = `${prev.text} ${c.text}`
      prev.top = c.top
      continue
    }
    merged.push({ ...c })
  }

  const perPage = new Map<number, number>()
  const kept = merged.filter((c) => {
    const count = (perPage.get(c.page) ?? 0) + 1
    perPage.set(c.page, count)
    return count <= MAX_PER_PAGE
  })

  // Group the heading sizes, largest first. A size whose headings are mostly numbered takes the level of that
  // numbering (so unnumbered "References" sits beside "9. Conclusions"); otherwise larger sizes sit higher.
  const sizes: number[] = []
  for (const r of kept.map(ratio).sort((a, b) => b - a)) if (!sizes.some((s) => Math.abs(s - r) < 0.12)) sizes.push(r)
  const clusterOf = (c: Candidate) => Math.max(0, sizes.findIndex((s) => Math.abs(s - ratio(c)) < 0.12))
  const votes = sizes.map(() => new Map<number, number>())
  for (const c of kept) if (c.depth !== null) votes[clusterOf(c)].set(c.depth, (votes[clusterOf(c)].get(c.depth) ?? 0) + 1)
  const clusterLevel = votes.map((v, i) => (v.size ? [...v].sort((a, b) => b[1] - a[1])[0][0] : i))
  const clusterSize = sizes.map((_, i) => kept.filter((c) => clusterOf(c) === i).length)

  let entries: (OutlineEntry & { cluster: number })[] = []
  for (const c of kept) {
    const title = c.text.replace(/\s+/g, ' ').trim()
    const cluster = clusterOf(c)
    const level = Math.min(2, c.keyword && !/^(section|topic)\b/i.test(title) ? 0 : c.depth !== null ? c.depth : clusterLevel[cluster])
    const prev = entries.at(-1)
    if (prev && prev.title.toLowerCase() === title.toLowerCase()) continue
    entries.push({ title, page: c.page, level, cluster })
  }

  // A one-off largest line at the start is the document's own title; the book already has that.
  const first = entries[0]
  if (first && first.page <= 2 && first.cluster === 0 && clusterSize[0] === 1 && entries.length > 3 && !kept[0].keyword) entries = entries.slice(1)

  // Close any gaps so every entry sits at most one level below the one before it.
  const minLevel = Math.min(...entries.map((e) => e.level))
  let last = -1
  const outline = entries.map((e): OutlineEntry => {
    const level = Math.min(e.level - minLevel, last + 1)
    last = level
    return { title: e.title, page: e.page, level }
  })
  onProgress?.(1)
  return outline
}
