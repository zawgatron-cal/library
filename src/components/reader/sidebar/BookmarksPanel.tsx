import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react'
import { updateBook } from '../../../lib/db'
import { IconButton } from '../../ui/primitives'
import { Empty, PanelHeader, type SidebarProps } from './shared'

export function BookmarksPanel({ book, currentPage, onJump }: SidebarProps) {
  const marked = book.bookmarks.some((b) => b.page === currentPage)
  const sorted = [...book.bookmarks].sort((a, b) => a.page - b.page)

  const toggle = () =>
    updateBook(book.id, (b) => ({
      bookmarks: marked ? b.bookmarks.filter((x) => x.page !== currentPage) : [...b.bookmarks, { page: currentPage, label: '', createdAt: Date.now() }],
    }))

  return (
    <div className="pb-6">
      <PanelHeader title="Bookmarks">
        <IconButton label={marked ? 'Remove bookmark' : 'Bookmark this page'} onClick={toggle} active={marked}>
          <BookmarkPlus />
        </IconButton>
      </PanelHeader>
      {sorted.length === 0 ? (
        <Empty>
          Press <strong>B</strong>, or click the ribbon at the top corner of any page, to tuck a bookmark into it.
        </Empty>
      ) : (
        <ul className="px-2">
          {sorted.map((b) => (
            <li key={b.page} className={`group flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-hover ${b.page === currentPage ? 'bg-sunken' : ''}`}>
              <button type="button" onClick={() => onJump(b.page)} className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-accent-strong tabular-nums" aria-label={`Go to page ${b.page}`}>
                <Bookmark className="size-3.5 fill-accent text-accent" />
                {b.page}
              </button>
              <input
                className="min-w-0 flex-1 rounded bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted/70 focus:bg-canvas"
                defaultValue={b.label}
                placeholder="Add a label…"
                onBlur={(e) => {
                  const label = e.target.value.trim()
                  if (label !== b.label) updateBook(book.id, (bk) => ({ bookmarks: bk.bookmarks.map((x) => (x.page === b.page ? { ...x, label } : x)) }))
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <button
                type="button"
                aria-label="Remove bookmark"
                onClick={() => updateBook(book.id, (bk) => ({ bookmarks: bk.bookmarks.filter((x) => x.page !== b.page) }))}
                className="rounded p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-ink"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}