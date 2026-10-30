import { useEffect, useState, useSyncExternalStore } from 'react'
import { countHighlights, getBook, listBooks, listHighlights, listOcrPages, subscribe, type Book, type Highlight, type OcrPage } from './db'
import { ocrProgressSnapshot, subscribeOcrProgress } from './ocr'

function useLiveQuery<T>(topics: ('books' | 'highlights' | 'ocr')[], query: () => Promise<T>, deps: unknown[]) {
  const [value, setValue] = useState<T | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const run = () => {
      query().then((result) => {
        if (!cancelled) setValue(result)
      })
    }
    run()
    const unsubs = topics.map((topic) => subscribe(topic, run))
    return () => {
      cancelled = true
      unsubs.forEach((fn) => fn())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return value
}

export function useBooks(): Book[] | undefined {
  return useLiveQuery(['books'], listBooks, [])
}

export function useBook(id: string | undefined | null): Book | null | undefined {
  return useLiveQuery(['books'], async () => (id ? ((await getBook(id)) ?? null) : null), [id])
}

export function useHighlights(bookId: string): Highlight[] {
  return useLiveQuery(['highlights'], () => listHighlights(bookId), [bookId]) ?? []
}

export function useHighlightCounts(): Record<string, number> {
  return useLiveQuery(['highlights'], countHighlights, []) ?? {}
}

const NO_OCR: ReadonlyMap<number, OcrPage> = new Map()

/** Recognised text for a book's scanned pages, by page number. */
export function useOcrPages(bookId: string): ReadonlyMap<number, OcrPage> {
  return useLiveQuery(['ocr'], async () => new Map((await listOcrPages(bookId)).map((p) => [p.page, p])), [bookId]) ?? NO_OCR
}

/** Live progress of text recognition for one book. */
export function useOcrProgress(bookId: string) {
  return useSyncExternalStore(subscribeOcrProgress, ocrProgressSnapshot).get(bookId)
}

export function useLocalStorage<T extends object>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...initial, ...JSON.parse(raw) } : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])

  return [value, setValue] as const
}
