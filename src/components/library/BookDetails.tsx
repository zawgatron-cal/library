import { useState, type ReactNode } from 'react'
import { BookOpen, Download, Trash2 } from 'lucide-react'
import { listHighlights, updateBook, type Book } from '../../lib/db'
import { downloadText, notesToMarkdown, safeFileName } from '../../lib/export'
import { bookProgress, formatBytes, formatDuration, formatRelative } from '../../lib/format'
import { navigate } from '../../lib/router'
import { Button, Field, Sheet, Toggle, inputClass } from '../ui/primitives'
import { useToast } from '../ui/toast'
import { setArchived } from './archive'
import { BookCover } from './BookCover'

export function BookDetailsSheet({ book, annotationCount, onClose, onDelete }: { book: Book; annotationCount: number; onClose: () => void; onDelete: () => void }) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [tags, setTags] = useState(book.tags.join(', '))
  const progress = bookProgress(book)
  const toast = useToast()

  const saveText = () =>
    updateBook(book.id, {
      title: title.trim() || book.title,
      author: author.trim(),
      tags: [...new Set(tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
    })

  const exportNotes = async () => {
    const highlights = await listHighlights(book.id)
    downloadText(`${safeFileName(book.title)} — notes.md`, notesToMarkdown(book, highlights))
  }

  return (
    <Sheet title="Details" onClose={onClose}>
      <div className="flex gap-5 pb-6">
        <BookCover book={book} className="w-28 shrink-0" />
        <div className="flex min-w-0 flex-col justify-end">
          <p className="font-display text-xl leading-snug font-medium">{book.title}</p>
          <p className="mt-1 text-sm text-muted">{book.author || 'Unknown author'}</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{progress >= 1 ? 'Finished' : progress > 0 ? `${Math.round(progress * 100)}% read` : 'Not started'}</p>
        </div>
      </div>

      <div className="flex gap-2 pb-6">
        <Button
          variant="primary"
          className="flex-1"
          onClick={() => {
            onClose()
            navigate({ view: 'reader', bookId: book.id })
          }}
        >
          <BookOpen className="size-4" /> {book.openedAt ? 'Continue' : 'Start reading'}
        </Button>
        <Button variant="outline" onClick={exportNotes} title="Export notes & annotations as Markdown">
          <Download className="size-4" /> Export
        </Button>
      </div>

      <div className="space-y-4 border-t border-line py-6">
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveText} />
        </Field>
        <Field label="Author">
          <input className={inputClass} value={author} onChange={(e) => setAuthor(e.target.value)} onBlur={saveText} placeholder="Unknown" />
        </Field>
        <Field label="Shelves" hint="Comma separated — e.g. philosophy, lit 101">
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} onBlur={saveText} placeholder="fiction, to study" />
        </Field>
        <Toggle label="Favourite" checked={book.favorite} onChange={(favorite) => updateBook(book.id, { favorite })} />
        <Toggle label="Finished" checked={book.finishedAt !== null} onChange={(f) => updateBook(book.id, { finishedAt: f ? Date.now() : null })} />
        <Toggle label="Archived" hint="Hidden from your shelves, nothing is deleted" checked={!!book.archivedAt} onChange={(a) => setArchived(book, a, toast)} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line py-6 text-sm">
        <Stat label="Pages">{book.pageCount}</Stat>
        <Stat label="Time reading">{book.readingSeconds ? formatDuration(book.readingSeconds) : '—'}</Stat>
        <Stat label="Annotations">{annotationCount}</Stat>
        <Stat label="Bookmarks">{book.bookmarks.length}</Stat>
        <Stat label="Added">{formatRelative(book.addedAt)}</Stat>
        <Stat label="Last opened">{book.openedAt ? formatRelative(book.openedAt) : '—'}</Stat>
        <div className="col-span-2">
          <Stat label="File">
            <span className="break-all">{book.fileName}</span> <span className="text-muted">· {formatBytes(book.fileSize)}</span>
          </Stat>
        </div>
      </dl>

      <div className="border-t border-line pt-6">
        <Button variant="danger" onClick={onDelete}>
          <Trash2 className="size-4" /> Remove from library
        </Button>
      </div>
    </Sheet>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.68rem] font-bold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 font-semibold">{children}</dd>
    </div>
  )
}
