import { useEffect, useState } from 'react'

export type Route = { view: 'library' } | { view: 'reader'; bookId: string }

function parse(hash: string): Route {
  const match = hash.match(/^#\/read\/([^/?]+)/)
  if (match) return { view: 'reader', bookId: decodeURIComponent(match[1]) }
  return { view: 'library' }
}

export function navigate(route: Route) {
  window.location.hash = route.view === 'reader' ? `#/read/${encodeURIComponent(route.bookId)}` : '#/'
}

export function useRoute() {
  const [route, setRoute] = useState(() => parse(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
