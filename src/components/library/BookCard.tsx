import { Archive, ArchiveRestore, BookCheck, Download, Heart, Info, MoreHorizontal, Trash2 } from 'lucide-react'
import { listHighlights, updateBook, type Book } from '../../lib/db'
import { downloadText, notesToMarkdown, safeFileName } from '../../lib/export'
import { bookProgress } from '../../lib/format'
import { useOcrProgress } from '../../lib/hooks'
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
  const ocr = useOcrProgress(book.id)
  const reading = book.ocr === 'queued' && ocr?.state === 'running' && ocr.total > 0
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
          className="block w-full"
          aria-label={`Open ${book.title}`}
        >
          <BookCover book={book} morph />
        </button>

        {progress > 0 && progress < 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-ink/10">
            <div className="h-full bg-ink" style={{ width: `${Math.max(progress * 100, 3)}%` }} />
          </div>
        )}
        {book.finishedAt && (
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 border border-ink bg-surface px-1.5 py-0.5 text-[0.62rem] font-bold tracking-wide text-ink uppercase">
            <BookCheck className="size-3" /> Finished
          </span>
        )}

        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            aria-label={book.favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={() => updateBook(book.id, { favorite: !book.favorite })}
            className="flex size-7 items-center justify-center border border-ink bg-surface text-ink hover:bg-ink hover:text-canvas"
          >
            <Heart className={`size-3.5 ${book.favorite ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            aria-label={archived ? 'Unarchive' : 'Archive'}
            title={archived ? 'Unarchive' : 'Archive'}
            onClick={toggleArchived}
            className="flex size-7 items-center justify-center border border-ink bg-surface text-ink hover:bg-ink hover:text-canvas"
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
                className="flex size-7 items-center justify-center border border-ink bg-surface text-ink hover:bg-ink hover:text-canvas"
              >
                <MoreHorizontal className="size-4" />
              </button>
            )}
          />
        </div>
        {book.favorite && <Heart className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 fill-ink text-ink" />}
      </div>

      <div className="mt-3 border-t border-ink/15 pt-2.5">
        <button
          type="button"
          onClick={(e) => openBook(book.id, e.currentTarget.closest('article'))}
          className="line-clamp-2 text-left font-display text-[1.02rem] leading-snug font-medium hover:underline decoration-1 underline-offset-2"
        >
          {book.title}
        </button>
        <p className="mt-0.5 truncate font-display text-xs text-muted italic">{book.author || 'Unknown author'}</p>
        <p className="mt-1 text-[0.68rem] font-semibold tracking-wide text-muted/80 uppercase">
          {reading ? (
            <span className="text-accent-strong">Reading text… {Math.round((ocr.done / ocr.total) * 100)}%</span>
          ) : progress >= 1 ? (
            'Read'
          ) : progress > 0 ? (
            `${Math.round(progress * 100)}%`
          ) : (
            'New'
          )}
          {annotationCount > 0 && ` · ${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`}
        </p>
      </div>
    </article>
  )
}
