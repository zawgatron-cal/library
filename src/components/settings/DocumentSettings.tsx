import { useState, type ReactNode } from 'react'
import { BookOpen, Download, Pause, Play, ScanText, Trash2 } from 'lucide-react'
import { deleteOcrPages, listHighlights, updateBook, type Book } from '../../lib/db'
import { useHighlightCounts, useOcrPages, useOcrProgress } from '../../lib/hooks'
import { pauseOcr, queueOcr } from '../../lib/ocr'
import { downloadText, notesToMarkdown, safeFileName } from '../../lib/export'
import { bookProgress, formatBytes, formatDuration, formatRelative } from '../../lib/format'
import { navigate } from '../../lib/router'
import { Button, Field, Toggle, inputClass } from '../ui/primitives'
import { useToast } from '../ui/toast'
import { setArchived } from '../library/archive'
import { BookCover } from '../library/BookCover'

/** Editable metadata, OCR, and stats for one book — used by library Details and Settings → Document. */
export function DocumentSettings({
  book,
  showContinue = false,
  showExport = true,
  onContinue,
  onDelete,
}: {
  book: Book
  showContinue?: boolean
  showExport?: boolean
  onContinue?: () => void
  onDelete: () => void
}) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [tags, setTags] = useState(book.tags.join(', '))
  const progress = bookProgress(book)
  const toast = useToast()
  const annotationCounts = useHighlightCounts()
  const annotationCount = annotationCounts[book.id] ?? 0

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
    <div>
      <div className="flex gap-5 pb-6">
        <BookCover book={book} className="w-28 shrink-0" />
        <div className="flex min-w-0 flex-col justify-end">
          <p className="font-display text-xl leading-snug font-medium">{book.title}</p>
          <p className="mt-1 text-sm text-muted">{book.author || 'Unknown author'}</p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-flourish" style={{ width: `${progress * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">{progress >= 1 ? 'Finished' : progress > 0 ? `${Math.round(progress * 100)}% read` : 'Not started'}</p>
        </div>
      </div>

      {(showContinue || showExport) && (
        <div className="flex gap-2 pb-6">
          {showContinue && (
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                onContinue?.()
                navigate({ view: 'reader', bookId: book.id })
              }}
            >
              <BookOpen className="size-4" /> {book.openedAt ? 'Continue' : 'Start reading'}
            </Button>
          )}
          {showExport && (
            <Button variant="outline" onClick={exportNotes} title="Export notes & annotations as Markdown" className={showContinue ? undefined : 'flex-1'}>
              <Download className="size-4" /> Export notes
            </Button>
          )}
        </div>
      )}

      <div className={`space-y-4 border-t border-line py-6 ${!showContinue && !showExport ? 'border-t-0 pt-0' : ''}`}>
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

      <TextRecognition book={book} />

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
    </div>
  )
}

function TextRecognition({ book }: { book: Book }) {
  const pages = useOcrPages(book.id)
  const progress = useOcrProgress(book.id)
  const running = book.ocr === 'queued'
  const counts = progress && progress.total ? `${progress.done} of ${progress.total} pages` : null

  let status: string
  if (running) status = counts ? `Reading pages… ${counts}` : 'Getting ready…'
  else if (book.ocr === 'paused') status = progress?.state === 'error' ? `Stopped: ${progress.message ?? 'something went wrong'}` : `Paused${counts ? ` at ${counts}` : ''}.`
  else if (book.ocr === 'done') status = pages.size ? `Text recognised on ${pages.size} page${pages.size === 1 ? '' : 's'}.` : 'Every page already had text of its own.'
  else status = 'For scans, photos and lecture notes whose text you can’t select. Runs on this device; nothing is uploaded.'

  const again = async () => {
    await deleteOcrPages(book.id)
    await queueOcr(book.id)
  }

  return (
    <section className="border-t border-line py-6">
      <h4 className="flex items-center gap-2 text-[0.68rem] font-bold tracking-wide text-muted uppercase">
        <ScanText className="size-3.5" /> Text recognition
      </h4>
      <p className="mt-2 text-sm leading-relaxed text-ink/80">{status}</p>
      {running && progress && progress.total > 0 && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {running ? (
          <Button size="sm" onClick={() => pauseOcr(book.id)}>
            <Pause className="size-3.5" /> Pause
          </Button>
        ) : book.ocr === 'paused' ? (
          <Button size="sm" onClick={() => queueOcr(book.id)}>
            <Play className="size-3.5" /> Resume
          </Button>
        ) : book.ocr === 'done' ? (
          <Button size="sm" onClick={again}>
            <ScanText className="size-3.5" /> Recognise again
          </Button>
        ) : (
          <Button size="sm" onClick={() => queueOcr(book.id)}>
            <ScanText className="size-3.5" /> Recognise text
          </Button>
        )}
      </div>
    </section>
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
