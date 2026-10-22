import type { Book, Highlight } from './db'

export function notesToMarkdown(book: Book, highlights: Highlight[]) {
  const lines: string[] = [`# ${book.title}`]
  if (book.author) lines.push(`*${book.author}*`)
  lines.push('')

  if (book.notes.trim()) {
    lines.push('## Notebook', '', book.notes.trim(), '')
  }

  if (highlights.length) {
    lines.push('## Highlights', '')
    for (const h of highlights) {
      lines.push(`> ${h.text.replace(/\s+/g, ' ').trim()}`, `>`, `> — p. ${h.page}`)
      if (h.note.trim()) lines.push('', h.note.trim())
      lines.push('')
    }
  }

  if (book.bookmarks.length) {
    lines.push('## Bookmarks', '')
    for (const b of [...book.bookmarks].sort((a, z) => a.page - z.page)) {
      lines.push(`- p. ${b.page}${b.label ? ` — ${b.label}` : ''}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function downloadText(fileName: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'notes'
}
