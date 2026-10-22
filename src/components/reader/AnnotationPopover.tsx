import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy, StickyNote, Trash2 } from 'lucide-react'
import { HIGHLIGHT_COLORS, deleteHighlight, putHighlight, type Highlight, type HighlightColor } from '../../lib/db'

const COLOR_NAMES: Record<HighlightColor, string> = {
  sun: 'Sunlight',
  leaf: 'Leaf',
  sky: 'Sky',
  rose: 'Rose',
  lilac: 'Lilac',
}

export type PopoverTarget =
  | { kind: 'selection'; text: string; anchor: { x: number; y: number }; create: (color: HighlightColor) => Promise<Highlight> }
  | { kind: 'highlight'; highlight: Highlight; anchor: { x: number; y: number } }

export function AnnotationPopover({ target, onClose, onCopied }: { target: PopoverTarget; onClose: () => void; onCopied: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: target.anchor.x, top: target.anchor.y + 10 })
  const [editing, setEditing] = useState<Highlight | null>(target.kind === 'highlight' ? target.highlight : null)
  const [note, setNote] = useState(target.kind === 'highlight' ? target.highlight.note : '')
  const [showNote, setShowNote] = useState(target.kind === 'highlight' && !!target.highlight.note)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const margin = 12
    let left = target.anchor.x - width / 2
    let top = target.anchor.y + 10
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin))
    if (top + height > window.innerHeight - margin) top = Math.max(margin, target.anchor.y - height - 36)
    setPos({ left, top })
  }, [target.anchor.x, target.anchor.y, showNote])

  const text = target.kind === 'highlight' ? target.highlight.text : target.text

  const pickColor = async (color: HighlightColor) => {
    if (editing) {
      const next = { ...editing, color }
      await putHighlight(next)
      setEditing(next)
      if (!showNote) onClose()
    } else if (target.kind === 'selection') {
      await target.create(color)
      window.getSelection()?.removeAllRanges()
      onClose()
    }
  }

  const openNote = async () => {
    if (!editing && target.kind === 'selection') {
      const created = await target.create('sun')
      window.getSelection()?.removeAllRanges()
      setEditing(created)
    }
    setShowNote(true)
  }

  const saveNote = async () => {
    if (editing && note !== editing.note) await putHighlight({ ...editing, note })
    onClose()
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Annotation"
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLTextAreaElement)) e.preventDefault()
      }}
      className="fixed z-50 animate-rise rounded-lg border border-line bg-surface p-1.5 shadow-lifted"
      style={{ left: pos.left, top: pos.top }}
    >
      <div className="flex items-center gap-1">
        {HIGHLIGHT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={COLOR_NAMES[c]}
            aria-label={`Highlight ${COLOR_NAMES[c]}`}
            onClick={() => pickColor(c)}
            className="flex size-8 items-center justify-center rounded-md transition hover:bg-hover"
          >
            <span className="swatch flex size-5 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.08)]" data-color={c}>
              {editing?.color === c && <Check className="size-3 text-ink/70" />}
            </span>
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <PopButton label="Note" onClick={openNote} active={showNote}>
          <StickyNote />
        </PopButton>
        <PopButton
          label="Copy"
          onClick={() => {
            navigator.clipboard?.writeText(text)
            onCopied()
            if (target.kind === 'selection') onClose()
          }}
        >
          <Copy />
        </PopButton>
        {editing && (
          <PopButton
            label="Delete"
            onClick={async () => {
              await deleteHighlight(editing.id)
              onClose()
            }}
          >
            <Trash2 />
          </PopButton>
        )}
      </div>
      {showNote && editing && (
        <div className="mt-1.5 w-72 border-t border-line p-1.5 pt-2.5">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote()
            }}
            placeholder="What does this make you think of?"
            rows={4}
            className="w-full resize-none rounded-md bg-paper p-2.5 font-display text-sm leading-relaxed text-ink outline-none placeholder:text-muted/70"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[0.65rem] text-muted">⌘/Ctrl + Enter to save</span>
            <button type="button" onClick={saveNote} className="rounded-md bg-accent px-3 py-1 text-xs font-bold text-on-accent hover:bg-accent-strong">
              Save
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

function PopButton({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-bold transition [&_svg]:size-3.5 ${active ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-hover hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
