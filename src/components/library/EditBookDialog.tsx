import { useState } from 'react'
import { deleteBook, updateBook, type Book } from '../../lib/db'
import { Button, Dialog, Field, Toggle, inputClass } from '../ui/primitives'

export function EditBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [tags, setTags] = useState(book.tags.join(', '))
  const [finished, setFinished] = useState(book.finishedAt !== null)

  const save = async () => {
    await updateBook(book.id, {
      title: title.trim() || book.title,
      author: author.trim(),
      tags: [...new Set(tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      finishedAt: finished ? (book.finishedAt ?? Date.now()) : null,
    })
    onClose()
  }

  return (
    <Dialog
      title="Book details"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Field label="Title">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Author">
          <input className={inputClass} value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Unknown" />
        </Field>
        <Field label="Shelves" hint="Comma separated — e.g. philosophy, course: lit 101">
          <input className={inputClass} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fiction, to study" />
        </Field>
        <Toggle label="Finished" hint="Mark this book as read." checked={finished} onChange={setFinished} />
        <button type="submit" hidden />
      </form>
    </Dialog>
  )
}

export function DeleteBookDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  return (
    <Dialog
      title="Remove from library?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await deleteBook(book.id)
              onClose()
            }}
          >
            Remove
          </Button>
        </>
      }
    >
      <p className="text-sm text-muted">
        <strong className="text-ink">{book.title}</strong> and all of its highlights, bookmarks and notes will be deleted from this computer.
      </p>
    </Dialog>
  )
}
