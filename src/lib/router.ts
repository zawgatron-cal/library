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
  clearNames()
  const cover = from?.matches('[data-cover]') ? (from as HTMLElement) : from?.querySelector<HTMLElement>('[data-cover]')
  if (cover) cover.style.viewTransitionName = bookTransitionName(bookId)
  navigate({ view: 'reader', bookId })
}

/* ----- screen readiness -----
   While a view transition's update runs, the browser freezes the old screen and pauses animation frames,
   so the new screen says when it has laid out instead of being measured on a timer. */

type Screen = Route['view']
let waiting: { screen: Screen; done: () => void } | null = null

/** Called by a screen once its layout is in place (the reader's pages, the library's shelves). */
export function screenReady(screen: Screen) {
  if (waiting?.screen === screen) waiting.done()
}

function waitForScreen(screen: Screen, timeout: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer)
      if (waiting?.done === done) waiting = null
      resolve()
    }
    const timer = setTimeout(done, timeout)
    waiting = { screen, done }
  })
}

function clearNames() {
  document.querySelectorAll<HTMLElement>('[data-cover], [data-page], [data-reader-stage]').forEach((el) => {
    el.style.viewTransitionName = ''
    el.style.removeProperty('view-transition-class')
  })
}

/** Give the book's transition name to the page in the middle of the reader, or to the whole stage if no page is laid out. */
function nameReaderPage(bookId: string) {
  const stage = document.querySelector<HTMLElement>('[data-reader-stage]')
  if (!stage) return
  const box = stage.getBoundingClientRect()
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  let best: HTMLElement = stage
  let bestDistance = Infinity
  for (const page of stage.querySelectorAll<HTMLElement>('[data-page]')) {
    const r = page.getBoundingClientRect()
    if (r.bottom < box.top || r.top > box.bottom || r.right < box.left || r.left > box.right) continue
    const distance = Math.hypot(Math.max(r.left - cx, 0, cx - r.right), Math.max(r.top - cy, 0, cy - r.bottom))
    if (distance < bestDistance) {
      best = page
      bestDistance = distance
    }
  }
  best.style.viewTransitionName = bookTransitionName(bookId)
  best.style.setProperty('view-transition-class', 'book')
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
    let current = parse(window.location.hash)
    const onChange = () => {
      const next = parse(window.location.hash)
      const previous = current
      current = next
      if (next.view === 'reader') lastBookId = next.bookId
      if (!document.startViewTransition || !motionAllowed() || previous.view === next.view) {
        setRoute(next)
        return
      }
      const opening = next.view === 'reader'
      const bookId = lastBookId
      if (!opening && bookId) {
        clearNames()
        nameReaderPage(bookId)
      }
      document.documentElement.dataset.transition = opening ? 'open' : 'close'
      const transition = document.startViewTransition(async () => {
        const ready = waitForScreen(next.view, opening ? 700 : 400)
        flushSync(() => setRoute(next))
        await ready
        if (opening && bookId) nameReaderPage(bookId)
      })
      transition.finished.finally(() => {
        delete document.documentElement.dataset.transition
        clearNames()
      })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
