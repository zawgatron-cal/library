import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  | {
      kind: 'highlight'
      highlight: Highlight
      anchor: { x: number; y: number }
      /** Type-to-note draft: Esc discards the highlight; ⌘/Ctrl+Enter saves the note. */
      draft?: { note: string }
    }

export function AnnotationPopover({
  target,
  onClose,
  onCopied,
  onHighlightCreated,
}: {
  target: PopoverTarget
  onClose: () => void
  onCopied: () => void
  onHighlightCreated?: (highlight: Highlight) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const saved = useRef(false)
  const seed = useRef(target.kind === 'highlight' ? (target.draft?.note ?? '') : '')
  const typingStarted = useRef(false)
  const [draft, setDraft] = useState(target.kind === 'highlight' && !!target.draft)
  const [pos, setPos] = useState({ left: target.anchor.x, top: target.anchor.y + 10 })
  const [editing, setEditing] = useState<Highlight | null>(target.kind === 'highlight' ? target.highlight : null)
  const [note, setNote] = useState(target.kind === 'highlight' ? (target.draft?.note ?? target.highlight.note) : '')
  const [showNote, setShowNote] = useState(target.kind === 'highlight' && (!!target.draft || !!target.highlight.note))

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

  // Only autofocus for type-to-note drafts. Clicking an existing annotation must leave
  // focus outside the textbox so Delete/Backspace still removes the highlight.
  useLayoutEffect(() => {
    if (!showNote || !draft) return
    const ta = taRef.current
    if (!ta) return
    ta.focus({ preventScroll: true })
    const len = ta.value.length
    ta.setSelectionRange(len, len)
  }, [showNote, draft])

  const focusNoteField = () => {
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus({ preventScroll: true })
      const len = ta.value.length
      ta.setSelectionRange(len, len)
    })
  }

  const text = target.kind === 'highlight' ? target.highlight.text : target.text

  const cancel = useCallback(async () => {
    if (draft && editing && !saved.current) await deleteHighlight(editing.id)
    onClose()
  }, [draft, editing, onClose])

  // Esc stops the gesture (capture so the reader doesn’t treat it as a generic dismiss).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      void cancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [cancel])

  // With a text selection, typing highlights (default sun) and starts a note with those characters.
  useEffect(() => {
    if (target.kind !== 'selection' || showNote) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return
      e.preventDefault()
      e.stopImmediatePropagation()
      seed.current += e.key
      if (typingStarted.current) {
        setNote(seed.current)
        return
      }
      typingStarted.current = true
      void target.create('sun').then((created) => {
        window.getSelection()?.removeAllRanges()
        onHighlightCreated?.(created)
        setEditing(created)
        setDraft(true)
        setNote(seed.current)
        setShowNote(true)
      })
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [target, showNote, onHighlightCreated])

  const pickColor = async (color: HighlightColor) => {
    if (editing) {
      const next = { ...editing, color }
      await putHighlight(next)
      setEditing(next)
      if (!showNote) {
        saved.current = true
        onClose()
      }
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
      onHighlightCreated?.(created)
      setEditing(created)
    }
    setShowNote(true)
    focusNoteField()
  }

  const saveNote = async () => {
    if (editing && note !== editing.note) await putHighlight({ ...editing, note })
    saved.current = true
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
              saved.current = true
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
            ref={taRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void saveNote()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                void cancel()
              }
            }}
            placeholder="What does this make you think of?"
            rows={4}
            className="w-full resize-none rounded-md bg-paper p-2.5 font-display text-sm leading-relaxed text-ink outline-none placeholder:text-muted/70"
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-[0.65rem] text-muted">⌘/Ctrl + Enter to save · Esc to cancel</span>
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
