import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { HIGHLIGHT_COLORS, deleteHighlight, type Book, type Highlight, type HighlightColor } from '../../../lib/db'
import { downloadText, notesToMarkdown, safeFileName } from '../../../lib/export'
import { IconButton } from '../../ui/primitives'
import { Empty, PanelHeader, type SidebarProps } from './shared'

export function AnnotationsPanel({ highlights, book, onJump, activeHighlightId }: SidebarProps) {
  const [color, setColor] = useState<HighlightColor | null>(null)
  const shown = color ? highlights.filter((h) => h.color === color) : highlights

  return (
    <div className="pb-6">
      <PanelHeader title="Annotations">
        <ExportButton book={book} highlights={highlights} />
      </PanelHeader>
      {highlights.length === 0 ? (
        <Empty>Select any text on a page to highlight it in one of five colours and write a note beside it.</Empty>
      ) : (
        <>
          <div className="flex items-center gap-1.5 px-5 pb-3">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Show ${c} annotations`}
                onClick={() => setColor(color === c ? null : c)}
                className={`swatch size-5 rounded-full transition ${color === c ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-surface' : color ? 'opacity-40' : ''}`}
                data-color={c}
              />
            ))}
            <span className="ml-auto text-xs text-muted">{shown.length}</span>
          </div>
          <ul className="space-y-1 px-2">
            {shown.map((h) => (
              <li key={h.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onJump(h.page, h.id)}
                  className={`flex w-full gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-hover ${activeHighlightId === h.id ? 'bg-sunken' : ''}`}
                >
                  <span className="swatch mt-1 w-1 shrink-0 self-stretch rounded-full" data-color={h.color} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-4 font-display text-[0.85rem] leading-relaxed">{h.text}</span>
                    {h.note && <span className="mt-1.5 block text-xs leading-relaxed whitespace-pre-wrap text-muted">{h.note}</span>}
                    <span className="mt-1 block text-[0.65rem] font-bold tracking-wider text-muted/80 uppercase">Page {h.page}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete annotation"
                  onClick={() => deleteHighlight(h.id)}
                  className="absolute top-2 right-2 rounded p-1 text-muted opacity-0 transition group-hover:opacity-100 hover:text-ink"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function ExportButton({ book, highlights }: { book: Book; highlights: Highlight[] }) {
  return (
    <IconButton label="Export notes & annotations as Markdown" onClick={() => downloadText(`${safeFileName(book.title)} — notes.md`, notesToMarkdown(book, highlights))}>
      <Download />
    </IconButton>
  )
}