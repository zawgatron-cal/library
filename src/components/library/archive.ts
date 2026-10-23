import { updateBook, type Book } from '../../lib/db'

type Toast = (message: string, action?: { label: string; onClick: () => void }) => void

/** Archive or restore a book, with an undo in the toast. */
export function setArchived(book: Book, archived: boolean, toast: Toast) {
  const previous = book.archivedAt ?? null
  updateBook(book.id, { archivedAt: archived ? Date.now() : null }).then(() =>
    toast(archived ? `Archived “${book.title}”` : `“${book.title}” is back on your shelves`, {
      label: 'Undo',
      onClick: () => updateBook(book.id, { archivedAt: previous }),
    }),
  )
}
