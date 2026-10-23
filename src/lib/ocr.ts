import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Worker } from 'tesseract.js'
import { getBook, getBookFile, listBooks, listOcrPages, putOcrPage, subscribe, updateBook, type OcrLine, type OcrPage } from './db'
import { normalizeRotation, unrotateRect } from './geometry'
import { documentOptions, pageHasText, pdfjs } from './pdf'

/*
  Text recognition runs entirely in the browser: pdf.js renders each page without a text layer to a canvas, and
  Tesseract (compiled to WebAssembly, bundled with the app along with its English model) reads it. Results are
  stored per page in IndexedDB. Books marked `ocr: 'queued'` are worked through one page at a time in the
  background, starting from wherever the reader currently is.
*/

const ASSETS = `${import.meta.env.BASE_URL}tesseract`
/** Longest side of the image handed to Tesseract; about 250 dpi for a letter-size page. */
const RENDER_SIZE = 2400
const MIN_CONFIDENCE = 35

export type OcrProgress = { bookId: string; done: number; total: number; state: 'starting' | 'running' | 'finished' | 'error'; message?: string }

const progress = new Map<string, OcrProgress>()
const listeners = new Set<() => void>()
let snapshot: ReadonlyMap<string, OcrProgress> = new Map()

function setProgress(p: OcrProgress) {
  progress.set(p.bookId, p)
  snapshot = new Map(progress)
  listeners.forEach((fn) => fn())
}

export function subscribeOcrProgress(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export const ocrProgressSnapshot = () => snapshot

/* ----- priorities ----- */

let focus: { bookId: string; page: number } | null = null

/** Tell the queue which page is being read, so recognition starts there and that book goes first. */
export function focusOcr(bookId: string, page: number) {
  focus = { bookId, page }
}

/* ----- engine ----- */

let workerPromise: Promise<Worker> | null = null

function getWorker() {
  workerPromise ??= import('tesseract.js').then(({ createWorker, OEM }) =>
    createWorker('eng', OEM.LSTM_ONLY, {
      workerPath: `${ASSETS}/worker.min.js`,
      corePath: `${ASSETS}/core`,
      langPath: `${ASSETS}/lang`,
      gzip: true,
      workerBlobURL: false,
    }),
  )
  workerPromise.catch(() => (workerPromise = null))
  return workerPromise
}

async function renderPage(pdf: PDFDocumentProxy, n: number, rotation: number) {
  const page = await pdf.getPage(n)
  const base = page.getViewport({ scale: 1, rotation: page.rotate + rotation })
  const viewport = page.getViewport({ scale: RENDER_SIZE / Math.max(base.width, base.height), rotation: page.rotate + rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  // Print intent renders without animation frames, so recognition keeps going in a background tab.
  await page.render({ canvas, viewport, intent: 'print' }).promise
  return canvas
}

export async function recognizePage(pdf: PDFDocumentProxy, bookId: string, n: number, rotation: number): Promise<OcrPage> {
  const canvas = await renderPage(pdf, n, rotation)
  const worker = await getWorker()
  const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true })
  const W = canvas.width
  const H = canvas.height
  const frac = (b: { x0: number; y0: number; x1: number; y1: number }) =>
    unrotateRect({ x: b.x0 / W, y: b.y0 / H, w: (b.x1 - b.x0) / W, h: (b.y1 - b.y0) / H }, rotation)
  const lines: OcrLine[] = []
  let confidence = 0
  let counted = 0
  for (const block of data.blocks ?? [])
    for (const paragraph of block.paragraphs)
      for (const line of paragraph.lines) {
        const words = line.words.filter((w) => w.text.trim() && w.confidence >= MIN_CONFIDENCE).map((w) => ({ text: w.text.trim(), box: frac(w.bbox) }))
        if (!words.length) continue
        lines.push({ box: frac(line.bbox), words })
        confidence += line.confidence
        counted++
      }
  canvas.width = canvas.height = 0
  return {
    key: `${bookId}:${n}`,
    bookId,
    page: n,
    lines,
    text: lines.map((l) => l.words.map((w) => w.text).join(' ')).join('\n'),
    confidence: counted ? confidence / counted : 0,
    rotation,
    createdAt: Date.now(),
  }
}

/* ----- queue ----- */

let running = false
let rerun = false

async function processBook(bookId: string) {
  const book = await getBook(bookId)
  const file = await getBookFile(bookId)
  if (!book || !file) return
  setProgress({ bookId, done: 0, total: 0, state: 'starting' })
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...documentOptions }).promise
  try {
    const stored = new Map((await listOcrPages(bookId)).map((p) => [p.page, p]))
    const needed: number[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const rotation = normalizeRotation(book.pageRotations?.[n] ?? 0)
      const existing = stored.get(n)
      if (existing && existing.rotation === rotation) continue
      if (!existing && (await pageHasText(await pdf.getPage(n)))) continue
      needed.push(n)
    }
    const total = needed.length + [...stored.values()].filter((p) => !needed.includes(p.page)).length
    let done = total - needed.length
    setProgress({ bookId, done, total, state: 'running' })

    while (needed.length) {
      const current = await getBook(bookId)
      if (!current || current.ocr !== 'queued') return
      // Start at the page being read, then carry on from there and wrap around.
      const from = focus?.bookId === bookId ? focus.page : 1
      needed.sort((a, b) => (a < from ? a + 1e6 : a) - (b < from ? b + 1e6 : b))
      const n = needed.shift()!
      const chosen = current.pageRotations?.[n]
      let result = await recognizePage(pdf, bookId, n, normalizeRotation(chosen ?? 0))
      // A page that reads as gibberish may have been scanned sideways: try the other ways up, and if one reads
      // clearly better, keep it and turn the page upright. Pages the reader has rotated themselves are left alone.
      if (chosen === undefined && result.confidence < 70) {
        for (const rotation of [90, 270, 180]) {
          const attempt = await recognizePage(pdf, bookId, n, rotation)
          if (attempt.confidence > result.confidence) result = attempt
        }
        if (result.rotation && result.confidence >= 75) {
          const turned = result.rotation
          await updateBook(bookId, (b) => ({ pageRotations: { ...b.pageRotations, [n]: turned } }))
        } else if (result.rotation) {
          result = await recognizePage(pdf, bookId, n, 0)
        }
      }
      await putOcrPage(result)
      done++
      setProgress({ bookId, done, total, state: 'running' })
    }
    // Headings found in the recognised text make better contents, so rebuild them.
    await updateBook(bookId, (b) => (b.ocr === 'queued' ? { ocr: 'done', generatedOutline: null } : {}))
    setProgress({ bookId, done, total, state: 'finished' })
  } finally {
    pdf.destroy()
  }
}

async function work() {
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    do {
      rerun = false
      const queued = (await listBooks()).filter((b) => b.ocr === 'queued')
      queued.sort((a, b) => Number(b.id === focus?.bookId) - Number(a.id === focus?.bookId))
      for (const book of queued) {
        try {
          await processBook(book.id)
        } catch (err) {
          console.error('Text recognition failed', err)
          setProgress({ bookId: book.id, done: 0, total: 0, state: 'error', message: err instanceof Error ? err.message : String(err) })
          await updateBook(book.id, { ocr: 'paused' })
        }
      }
    } while (rerun)
  } finally {
    running = false
  }
}

let started = false

/** Begin watching for books that need their text recognised. */
export function startOcrQueue() {
  if (started) return
  started = true
  subscribe('books', () => void work())
  void work()
}

export function queueOcr(bookId: string) {
  return updateBook(bookId, { ocr: 'queued' })
}

export function pauseOcr(bookId: string) {
  return updateBook(bookId, { ocr: 'paused' })
}
