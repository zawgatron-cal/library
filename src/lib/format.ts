export function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  if (minutes < 1) return 'under a minute'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

export function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp
  const minute = 60_000
  const day = 24 * 60 * minute
  if (diff < minute) return 'just now'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} min ago`
  if (diff < day) return `${Math.floor(diff / (60 * minute))} h ago`
  if (diff < 2 * day) return 'yesterday'
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function greeting(date = new Date()) {
  const h = date.getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Good night'
}

export function bookProgress(book: { position: { page: number; offset: number } | null; pageCount: number; finishedAt: number | null }) {
  if (book.finishedAt) return 1
  if (!book.position || book.pageCount <= 1) return 0
  return Math.min(1, (book.position.page - 1 + book.position.offset) / (book.pageCount - 1))
}

/** The page a reader would say they're "on" for a saved position. */
export function displayPage(position: { page: number; offset: number } | null, pageCount: number) {
  if (!position) return 1
  return Math.min(pageCount, position.page + (position.offset > 0.6 ? 1 : 0))
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
