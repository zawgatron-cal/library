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

export function bookProgress(book: { position: { page: number; offset: number } | null; pageCount: number; finishedAt: number | null }) {
  if (book.finishedAt) return 1
  if (!book.position || book.pageCount <= 1) return 0
  return Math.min(1, (book.position.page - 1 + book.position.offset) / (book.pageCount - 1))
}

export function displayPage(position: { page: number } | null, pageCount: number) {
  return Math.min(pageCount, position?.page ?? 1)
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SMALL_WORDS = new Set('a an and as at but by for from in into nor of on or over per the to via vs with'.split(' '))
const ROMAN = /^(?=[MDCLXVI])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/

/** Headings set in capitals ("CHAPTER IV. THE WAR OF THE WORLDS") read more calmly in title case. */
export function tidyHeading(title: string) {
  const letters = title.match(/\p{L}/gu) ?? []
  const upper = letters.filter((c) => c !== c.toLowerCase()).length
  if (letters.length < 4 || upper < letters.length * 0.6 || /^\p{L}{1,3}$/u.test(title.trim())) return title
  let first = true
  return title.replace(/[\p{L}\p{N}'’]+/gu, (word, offset: number) => {
    const before = title.slice(0, offset)
    const startsPhrase = first || /([:.!?—–-]|\d)\s*$/.test(before)
    first = false
    if (word !== word.toUpperCase() || ROMAN.test(word)) return word
    // The letter in "Appendix A" or "Part B" is a label, not the article.
    if (word.length === 1 && /(appendix|part|section|chapter|unit|figure|table)\s*$/i.test(before)) return word
    const lower = word.toLowerCase()
    if (!startsPhrase && SMALL_WORDS.has(lower)) return lower
    return lower.replace(/\p{L}/u, (c) => c.toUpperCase())
  })
}
