import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { pdfjs } from 'react-pdf'
import { addBook, listBooks, moveBookToShelf, newId, type Book } from './db'
import { desktop, isDesktop, type ShelfStatus } from './desktop'

const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
// One worker, started with the app and shared by every document, so opening a book doesn't wait for pdf.js to boot.
if (typeof Worker !== 'undefined') pdfjs.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: 'module' })

let backgroundWorker: InstanceType<typeof pdfjs.PDFWorker> | null = null

/** A second, long-lived worker for background jobs (text recognition), so they never queue behind the page you're reading. */
export function backgroundPdfWorker() {
  backgroundWorker ??= pdfjs.PDFWorker.create({ port: new Worker(workerUrl, { type: 'module' }) })
  return backgroundWorker
}

export { pdfjs }

export const documentOptions = {
  cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/`,
  iccUrl: `${import.meta.env.BASE_URL}pdfjs/iccs/`,
}

/** Asks the reader for a PDF's password; resolves to null if they cancel. */
export type AskPassword = (fileName: string, wrongGuess: boolean) => Promise<string | null>

/** pdf.js's reason codes for asking: the password is needed, or the last one given was wrong. */
const INCORRECT_PASSWORD = 2

/** Opens a PDF, asking for its password if it has one. `password` is tried first, if given. */
export async function openPdf(data: Uint8Array, fileName: string, ask: AskPassword, password?: string, worker?: InstanceType<typeof pdfjs.PDFWorker>) {
  const task = pdfjs.getDocument({ data, ...documentOptions, password, worker })
  let used = password
  task.onPassword = (update: (password: string) => void, reason: number) => {
    void ask(fileName, reason === INCORRECT_PASSWORD).then((answer) => {
      if (answer == null) void task.destroy()
      else update((used = answer))
    })
  }
  const pdf = await task.promise
  return { pdf, password: used }
}

/** A short, human reason a PDF couldn't be opened. */
export function openFailure(err: unknown) {
  const name = (err as { name?: string } | null)?.name
  if (name === 'PasswordException') return 'it needs a password'
  if (name === 'InvalidPDFException') return 'the file looks damaged or incomplete'
  if (name === 'AbortException' || /destroyed/i.test(String((err as Error | null)?.message))) return null
  return 'it may be damaged'
}

/** Pages with fewer characters of real text than this are treated as images that need text recognition. */
const MIN_TEXT = 25

export async function pageHasText(page: PDFPageProxy) {
  const content = await page.getTextContent()
  let length = 0
  for (const item of content.items) if ('str' in item) length += item.str.trim().length
  return length >= MIN_TEXT
}

/** Whether most of the first few pages are images without a text layer, as in scans and photographed notes. */
export async function looksScanned(pdf: PDFDocumentProxy) {
  const sample = Math.min(pdf.numPages, 6)
  let withoutText = 0
  for (let n = 1; n <= sample; n++) if (!(await pageHasText(await pdf.getPage(n)).catch(() => true))) withoutText++
  return withoutText > sample / 2
}

const COVER_WIDTH = 360

function titleFromFileName(name: string) {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanMeta(value: unknown) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || /^untitled/i.test(trimmed) || /\.(docx?|pdf|tex|indd)$/i.test(trimmed)) return ''
  return trimmed
}

async function renderCover(pdf: PDFDocumentProxy) {
  const page = await pdf.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: COVER_WIDTH / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  await page.render({ canvas, viewport }).promise
  return canvas.toDataURL('image/jpeg', 0.82)
}

async function placeOnDesktopShelf(file: File, sourcePath?: string | null) {
  const api = desktop()
  if (!api) return null
  const status = await api.shelfStatus()
  if (!status.enabled) return null
  const path = sourcePath || api.pathForFile(file)
  if (path) {
    return api.placeOnShelf({ sourcePath: path, fileName: file.name, move: false })
  }
  return api.placeOnShelf({ bytes: await file.arrayBuffer(), fileName: file.name })
}

export async function importPdf(file: File, ask: AskPassword, opts?: { sourcePath?: string | null }): Promise<Book> {
  const shelfFile = await placeOnDesktopShelf(file, opts?.sourcePath).catch(() => null)
  const bytes = shelfFile
    ? new Uint8Array(await desktop()!.readShelfFile(shelfFile))
    : new Uint8Array(await file.arrayBuffer())
  return bookFromPdfData(bytes, file.name, ask, shelfFile)
}

/** Build a Book record from open PDF bytes and optionally pin it to a shelf-relative path. */
async function bookFromPdfData(
  data: Uint8Array,
  fileName: string,
  ask: AskPassword,
  shelfFile: string | null,
): Promise<Book> {
  const { pdf, password } = await openPdf(data, fileName, ask)
  try {
    const meta = await pdf.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as Record<string, unknown>
    const cover = await renderCover(pdf).catch(() => null)
    const scanned = await looksScanned(pdf).catch(() => false)
    const book: Book = {
      id: newId(),
      title: cleanMeta(info.Title) || titleFromFileName(fileName),
      author: cleanMeta(info.Author),
      tags: [],
      fileName: shelfFile || fileName,
      fileSize: data.byteLength,
      pageCount: pdf.numPages,
      cover,
      addedAt: Date.now(),
      openedAt: null,
      finishedAt: null,
      favorite: false,
      archivedAt: null,
      position: null,
      zoom: 'fit',
      readingSeconds: 0,
      bookmarks: [],
      notes: '',
      ocr: scanned ? 'queued' : null,
      ...(password ? { password } : {}),
      ...(shelfFile ? { shelfFile } : {}),
    }
    const fileBytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    await addBook(book, shelfFile ? null : new Blob([fileBytes], { type: 'application/pdf' }))
    return book
  } finally {
    pdf.destroy()
  }
}

/** Import a PDF already on disk (desktop file picker). Copies into Documents/Library when the shelf is on. */
export async function importPdfFromPath(sourcePath: string, ask: AskPassword): Promise<Book> {
  const api = desktop()
  if (!api) throw new Error('Desktop only')
  const fileName = sourcePath.split(/[/\\]/).pop() || 'book.pdf'
  const status = await api.shelfStatus()
  if (!status.enabled) await api.enableShelf()
  const shelfFile = await api.placeOnShelf({ sourcePath, fileName, move: false })
  const data = new Uint8Array(await api.readShelfFile(shelfFile))
  return bookFromPdfData(data, fileName, ask, shelfFile)
}

/** Turn on Documents/Library, move any blob-stored PDFs there, and open the folder. */
export async function activateShelf(): Promise<{ status: ShelfStatus; moved: number }> {
  const api = desktop()
  if (!api) throw new Error('Desktop only')
  const status = await api.enableShelf()
  const books = await listBooks()
  let moved = 0
  for (const book of books) {
    if (book.shelfFile) continue
    try {
      if (await moveBookToShelf(book.id)) moved++
    } catch {
      /* keep blob copy */
    }
  }
  await api.openShelf()
  return { status, moved }
}

/** Add any PDFs sitting in Documents/Library that aren't on the shelves yet. */
export async function syncShelfFolder(ask: AskPassword) {
  if (!isDesktop()) return []
  const api = desktop()
  if (!api) return []
  const status = await api.shelfStatus()
  if (!status.enabled) return []
  const onDisk = await api.listShelf()
  const books = await listBooks()
  const known = new Set(books.map((b) => b.shelfFile).filter(Boolean) as string[])
  const added: Book[] = []
  for (const pdf of onDisk) {
    if (known.has(pdf.relative)) continue
    try {
      const data = new Uint8Array(await api.readShelfFile(pdf.relative))
      added.push(await bookFromPdfData(data, pdf.name, ask, pdf.relative))
    } catch {
      /* skip unreadable */
    }
  }
  return added
}

/** By name or type, or failing those (files saved without an extension) by the `%PDF-` signature near the start. */
export async function isPdf(file: File) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) return true
  if (file.type && !/octet-stream|^$/.test(file.type)) return false
  return (await file.slice(0, 1024).text().catch(() => '')).includes('%PDF-')
}
