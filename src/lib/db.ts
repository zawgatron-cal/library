import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type Bookmark = {
  page: number
  label: string
  createdAt: number
}

export type ReadingPosition = {
  page: number
  /** 0–1, how far along the page the middle of the viewport sits */
  offset: number
}

export type Book = {
  id: string
  title: string
  author: string
  tags: string[]
  fileName: string
  fileSize: number
  pageCount: number
  cover: string | null
  addedAt: number
  openedAt: number | null
  finishedAt: number | null
  favorite: boolean
  /** Archived books stay in the database but are hidden from the shelves. Missing on books added before archiving existed. */
  archivedAt?: number | null
  position: ReadingPosition | null
  zoom: number | 'fit'
  readingSeconds: number
  bookmarks: Bookmark[]
  notes: string
}

export const HIGHLIGHT_COLORS = ['sun', 'leaf', 'sky', 'rose', 'lilac'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

/** Rectangle expressed as fractions (0–1) of the page's width and height. */
export type Rect = { x: number; y: number; w: number; h: number }

export type Highlight = {
  id: string
  bookId: string
  page: number
  rects: Rect[]
  text: string
  color: HighlightColor
  note: string
  createdAt: number
}

interface LibrarySchema extends DBSchema {
  books: { key: string; value: Book }
  files: { key: string; value: Blob }
  highlights: { key: string; value: Highlight; indexes: { bookId: string } }
}

let dbPromise: Promise<IDBPDatabase<LibrarySchema>> | null = null

function db() {
  dbPromise ??= openDB<LibrarySchema>('library', 1, {
    upgrade(database) {
      database.createObjectStore('books', { keyPath: 'id' })
      database.createObjectStore('files')
      const highlights = database.createObjectStore('highlights', { keyPath: 'id' })
      highlights.createIndex('bookId', 'bookId')
    },
  })
  return dbPromise
}

type Topic = 'books' | 'highlights'
const listeners = new Map<Topic, Set<() => void>>()

export function subscribe(topic: Topic, fn: () => void) {
  if (!listeners.has(topic)) listeners.set(topic, new Set())
  listeners.get(topic)!.add(fn)
  return () => {
    listeners.get(topic)!.delete(fn)
  }
}

function emit(topic: Topic) {
  listeners.get(topic)?.forEach((fn) => fn())
}

export const newId = () => crypto.randomUUID()

export async function listBooks() {
  return (await db()).getAll('books')
}

export async function getBook(id: string) {
  return (await db()).get('books', id)
}

export async function getBookFile(id: string) {
  return (await db()).get('files', id)
}

export async function addBook(book: Book, file: Blob) {
  const tx = (await db()).transaction(['books', 'files'], 'readwrite')
  await Promise.all([tx.objectStore('books').put(book), tx.objectStore('files').put(file, book.id), tx.done])
  emit('books')
}

export async function updateBook(id: string, patch: Partial<Book> | ((book: Book) => Partial<Book>)) {
  const database = await db()
  const tx = database.transaction('books', 'readwrite')
  const current = await tx.store.get(id)
  if (!current) return
  const changes = typeof patch === 'function' ? patch(current) : patch
  await tx.store.put({ ...current, ...changes })
  await tx.done
  emit('books')
}

export async function deleteBook(id: string) {
  const database = await db()
  const tx = database.transaction(['books', 'files', 'highlights'], 'readwrite')
  const highlightKeys = await tx.objectStore('highlights').index('bookId').getAllKeys(id)
  await Promise.all([
    tx.objectStore('books').delete(id),
    tx.objectStore('files').delete(id),
    ...highlightKeys.map((key) => tx.objectStore('highlights').delete(key)),
  ])
  await tx.done
  emit('books')
  emit('highlights')
}

export async function listHighlights(bookId: string) {
  const all = await (await db()).getAllFromIndex('highlights', 'bookId', bookId)
  return all.sort((a, b) => a.page - b.page || (a.rects[0]?.y ?? 0) - (b.rects[0]?.y ?? 0))
}

export async function putHighlight(highlight: Highlight) {
  await (await db()).put('highlights', highlight)
  emit('highlights')
}

export async function deleteHighlight(id: string) {
  await (await db()).delete('highlights', id)
  emit('highlights')
}

export async function countHighlights() {
  const all = await (await db()).getAll('highlights')
  const counts: Record<string, number> = {}
  for (const h of all) counts[h.bookId] = (counts[h.bookId] ?? 0) + 1
  return counts
}
