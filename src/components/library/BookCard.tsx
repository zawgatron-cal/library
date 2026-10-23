import { Archive, ArchiveRestore, BookCheck, Download, Heart, Info, MoreHorizontal, Trash2 } from 'lucide-react'
import { listHighlights, updateBook, type Book } from '../../lib/db'
import { downloadText, notesToMarkdown, safeFileName } from '../../lib/export'
import { bookProgress } from '../../lib/format'
import { Menu } from '../ui/Menu'
import { BookCover } from './BookCover'
import { openBook } from '../../lib/router'
import { useToast } from '../ui/toast'
import { setArchived } from './archive'

export function BookCard({
  book,
  annotationCount,
  onDetails,
  onDelete,
}: {
  book: Book
  annotationCount: number
  onDetails: () => void
  onDelete: () => void
}) {
  const progress = bookProgress(book)
  const toast = useToast()
  const archived = !!book.archivedAt
  const toggleArchived = () => setArchived(book, !archived, toast)

  const exportNotes = async () => {
    const highlights = await listHighlights(book.id)
    downloadText(`${safeFileName(book.title)} — notes.md`, notesToMarkdown(book, highlights))
  }

  return (
    <article
      className="group"
      onContextMenu={(e) => {
        e.preventDefault()
        onDetails()
      }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={(e) => openBook(book.id, e.currentTarget)}
          className="block w-full transition duration-300 ease-out group-hover:-translate-y-1.5"
          aria-label={`Open ${book.title}`}
        >
          <BookCover book={book} morph className="group-hover:shadow-lifted" />
        </button>

        {progress > 0 && progress < 1 && (
          <div className="pointer-events-none absolute inset-x-2 bottom-2 h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] backdrop-blur-sm transition duration-300 ease-out group-hover:-translate-y-1.5">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(progress * 100, 3)}%` }} />
          </div>
        )}
        {book.finishedAt && (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface/90 px-2 py-0.5 text-[0.65rem] font-bold text-accent-strong shadow-soft backdrop-blur transition duration-300 ease-out group-hover:-translate-y-1.5">
            <BookCheck className="size-3" /> Finished
          </span>
        )}

        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition duration-300 ease-out group-focus-within:opacity-100 group-hover:-translate-y-1.5 group-hover:opacity-100">
          <button
            type="button"
            aria-label={book.favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => updateBook(book.id, { favorite: !book.favorite })}
            className="flex size-7.5 items-center justify-center rounded-full bg-surface/90 text-ink shadow-soft backdrop-blur hover:text-accent"
          >
            <Heart className={`size-3.5 ${book.favorite ? 'fill-accent text-accent' : ''}`} />
          </button>
          <button
            type="button"
            aria-label={archived ? 'Unarchive' : 'Archive'}
            title={archived ? 'Unarchive' : 'Archive'}
            onClick={toggleArchived}
            className="flex size-7.5 items-center justify-center rounded-full bg-surface/90 text-ink shadow-soft backdrop-blur hover:text-accent"
          >
            {archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
          </button>
          <Menu
            items={[
              { label: 'Details', icon: <Info />, onSelect: onDetails },
              { label: 'Export notes', icon: <Download />, onSelect: exportNotes },
              { label: archived ? 'Unarchive' : 'Archive', icon: archived ? <ArchiveRestore /> : <Archive />, onSelect: toggleArchived },
              { label: 'Remove', icon: <Trash2 />, onSelect: onDelete, danger: true },
            ]}
            trigger={({ onClick }) => (
              <button
                type="button"
                aria-label="More"
                onClick={onClick}
                className="flex size-7.5 items-center justify-center rounded-full bg-surface/90 text-ink shadow-soft backdrop-blur hover:text-accent"
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
          />
        </div>
        {book.favorite && (
          <Heart className="pointer-events-none absolute top-3 left-3 size-3.5 fill-accent text-accent drop-shadow transition duration-300 ease-out group-hover:-translate-y-1.5" />
        )}
      </div>

      <div className="mt-[1.4rem] px-0.5">
        <button
          type="button"
          onClick={(e) => openBook(book.id, e.currentTarget.closest('article'))}
          className="line-clamp-2 text-left font-display text-[0.95rem] leading-snug font-medium hover:text-accent-strong"
        >
          {book.title}
        </button>
        <p className="mt-0.5 truncate text-xs text-muted">{book.author || 'Unknown author'}</p>
        <p className="mt-1 text-[0.7rem] font-semibold text-muted/80">
          {progress >= 1 ? 'Read' : progress > 0 ? `${Math.round(progress * 100)}%` : 'New'}
          {annotationCount > 0 && ` · ${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`}
        </p>
      </div>
    </article>
  )
}
