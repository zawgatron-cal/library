import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export type Route = { view: 'library' } | { view: 'reader'; bookId: string }

function parse(hash: string): Route {
  const match = hash.match(/^#\/read\/([^/?]+)/)
  if (match) return { view: 'reader', bookId: decodeURIComponent(match[1]) }
  return { view: 'library' }
}

let lastBookId: string | null = null

/** The book most recently opened, so its cover can morph into (and back out of) the reader. */
export const transitionBookId = () => lastBookId

export const bookTransitionName = (id: string) => `book-${id.replace(/[^a-zA-Z0-9-]/g, '')}`

export function navigate(route: Route) {
  if (route.view === 'reader') lastBookId = route.bookId
  window.location.hash = route.view === 'reader' ? `#/read/${encodeURIComponent(route.bookId)}` : '#/'
}

/** Open a book so that the clicked cover grows into the reader. */
export function openBook(bookId: string, from?: Element | null) {
  document.querySelectorAll<HTMLElement>('[data-cover]').forEach((el) => (el.style.viewTransitionName = ''))
  const cover = from?.matches('[data-cover]') ? (from as HTMLElement) : from?.querySelector<HTMLElement>('[data-cover]')
  if (cover) cover.style.viewTransitionName = bookTransitionName(bookId)
  navigate({ view: 'reader', bookId })
}

function motionAllowed() {
  return document.documentElement.dataset.reduceMotion !== 'true' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useRoute() {
  const [route, setRoute] = useState(() => {
    const initial = parse(window.location.hash)
    if (initial.view === 'reader') lastBookId = initial.bookId
    return initial
  })
  useEffect(() => {
    const onChange = () => {
      const next = parse(window.location.hash)
      if (next.view === 'reader') lastBookId = next.bookId
      if (!document.startViewTransition || !motionAllowed()) {
        setRoute(next)
        return
      }
      document.documentElement.dataset.transition = next.view === 'reader' ? 'open' : 'close'
      const transition = document.startViewTransition(() => flushSync(() => setRoute(next)))
      transition.finished.finally(() => delete document.documentElement.dataset.transition)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
