import { DocumentSettings } from '../settings/DocumentSettings'
import { Sheet } from '../ui/primitives'
import type { Book } from '../../lib/db'

export function BookDetailsSheet({ book, onClose, onDelete }: { book: Book; onClose: () => void; onDelete: () => void }) {
  return (
    <Sheet title="Details" onClose={onClose}>
      <DocumentSettings
        book={book}
        showContinue
        showExport
        onContinue={onClose}
        onDelete={() => {
          onClose()
          onDelete()
        }}
      />
    </Sheet>
  )
}
