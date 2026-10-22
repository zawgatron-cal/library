import { useEffect, useState } from 'react'
import { countHighlights, getBook, listBooks, listHighlights, subscribe, type Book, type Highlight } from './db'

function useLiveQuery<T>(topics: ('books' | 'highlights')[], query: () => Promise<T>, deps: unknown[]) {
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

export function useBook(id: string): Book | null | undefined {
  return useLiveQuery(['books'], async () => (await getBook(id)) ?? null, [id])
}

export function useHighlights(bookId: string): Highlight[] {
  return useLiveQuery(['highlights'], () => listHighlights(bookId), [bookId]) ?? []
}

export function useHighlightCounts(): Record<string, number> {
  return useLiveQuery(['highlights'], countHighlights, []) ?? {}
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
