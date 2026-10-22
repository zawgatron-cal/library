import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from 'react-pdf'
import { addBook, newId, type Book } from './db'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

export { pdfjs }

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

export async function importPdf(file: File): Promise<Book> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjs.getDocument({ data }).promise
  try {
    const meta = await pdf.getMetadata().catch(() => null)
    const info = (meta?.info ?? {}) as Record<string, unknown>
    const cover = await renderCover(pdf).catch(() => null)

    const book: Book = {
      id: newId(),
      title: cleanMeta(info.Title) || titleFromFileName(file.name),
      author: cleanMeta(info.Author),
      tags: [],
      fileName: file.name,
      fileSize: file.size,
      pageCount: pdf.numPages,
      cover,
      addedAt: Date.now(),
      openedAt: null,
      finishedAt: null,
      favorite: false,
      position: null,
      zoom: 'fit',
      readingSeconds: 0,
      bookmarks: [],
      notes: '',
    }
    await addBook(book, new Blob([file], { type: 'application/pdf' }))
    return book
  } finally {
    pdf.destroy()
  }
}

export function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
