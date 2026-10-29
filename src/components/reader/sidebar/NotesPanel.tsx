import { useEffect, useRef, useState } from 'react'
import { updateBook } from '../../../lib/db'
import { PanelHeader, type SidebarProps } from './shared'
import { ExportButton } from './AnnotationsPanel'

export function NotesPanel({ book, highlights, currentPage }: SidebarProps) {
  const [text, setText] = useState(book.notes)
  const [saved, setSaved] = useState(true)
  const ref = useRef<HTMLTextAreaElement>(null)
  const latest = useRef(text)

  useEffect(() => {
    latest.current = text
    if (text === book.notes) return
    const timer = setTimeout(() => {
      updateBook(book.id, { notes: text }).then(() => setSaved(true))
    }, 500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(
    () => () => {
      if (latest.current !== book.notes) updateBook(book.id, { notes: latest.current })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const insertPageRef = () => {
    const el = ref.current
    if (!el) return
    const token = `(p. ${currentPage}) `
    const start = el.selectionStart
    setText(text.slice(0, start) + token + text.slice(el.selectionEnd))
    setSaved(false)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    })
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title="Notes">
        <ExportButton book={book} highlights={highlights} />
      </PanelHeader>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-4">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSaved(false)
          }}
          placeholder={'Thoughts, questions, summaries…\n\nTip: drop in a page reference so you can find your way back.'}
          className="min-h-0 flex-1 resize-none rounded-md border border-line bg-[repeating-linear-gradient(transparent,transparent_1.7rem,var(--color-line)_1.7rem,var(--color-line)_calc(1.7rem+1px))] bg-paper p-4 pt-[0.45rem] font-display text-[0.92rem] leading-[1.7rem] text-ink outline-none placeholder:text-muted/70 focus:border-accent"
          style={{ backgroundAttachment: 'local' }}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted">
          <button type="button" onClick={insertPageRef} className="rounded-md px-2 py-1 font-semibold text-accent-strong hover:bg-accent-soft">
            + Page {currentPage} reference
          </button>
          <span>
            {words} words · {saved ? 'saved' : 'saving…'}
          </span>
        </div>
      </div>
    </div>
  )
}