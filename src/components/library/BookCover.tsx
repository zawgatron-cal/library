import type { Book } from '../../lib/db'

/** Hand-set placeholder cover for PDFs whose first page could not be rendered. */
function PlainCover({ book }: { book: Book }) {
  return (
    <div className="flex h-full flex-col justify-between bg-accent-soft p-4 text-accent-strong">
      <div className="h-px w-8 bg-current opacity-40" />
      <div>
        <p className="line-clamp-4 font-display text-lg leading-snug font-medium">{book.title}</p>
        {book.author && <p className="mt-2 line-clamp-2 text-xs opacity-75">{book.author}</p>}
      </div>
      <div className="h-px w-8 bg-current opacity-40" />
    </div>
  )
}

export function BookCover({ book, className = '' }: { book: Book; className?: string }) {
  return (
    <div className={`book-cover relative aspect-[2/3] overflow-hidden rounded-[calc(var(--radius-sm)+1px)] bg-surface shadow-soft ${className}`}>
      {book.cover ? <img src={book.cover} alt="" className="size-full object-cover object-top" draggable={false} /> : <PlainCover book={book} />}
    </div>
  )
}
