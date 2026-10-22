import { deleteBook, type Book } from '../../lib/db'
import { Button, Dialog } from '../ui/primitives'

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
