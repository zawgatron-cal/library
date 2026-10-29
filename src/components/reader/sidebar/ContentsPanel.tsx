import { useEffect, useMemo, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { Bookmark, ChevronRight, ChevronsDownUp, ChevronsUpDown, Search } from 'lucide-react'
import { tidyHeading } from '../../../lib/format'
import { inputClass } from '../../ui/primitives'
import { Empty, PanelHeader, type SidebarProps } from './shared'

type OutlineNode = { id: string; title: string; page: number | null; children: OutlineNode[] }
type RawOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>

async function resolveOutline(pdf: PDFDocumentProxy, items: RawOutline, prefix = ''): Promise<OutlineNode[]> {
  return Promise.all(
    (items ?? []).map(async (item, i) => {
      const id = prefix ? `${prefix}.${i}` : String(i)
      let page: number | null = null
      try {
        const dest = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
        const ref = Array.isArray(dest) ? dest[0] : null
        if (typeof ref === 'number') page = ref + 1
        else if (ref) page = (await pdf.getPageIndex(ref)) + 1
      } catch {
        page = null
      }
      return { id, title: tidyHeading(item.title), page, children: await resolveOutline(pdf, item.items, id) }
    }),
  )
}

type FlatNode = OutlineNode & { depth: number }

function flattenAll(nodes: OutlineNode[], depth = 0): FlatNode[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenAll(n.children, depth + 1)])
}

const ancestorsOf = (id: string) => id.split('.').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('.'))

export function ContentsPanel({ pdf, currentPage, onJump, book }: SidebarProps) {
  const [embedded, setEmbedded] = useState<OutlineNode[] | null>(null)
  const [mode, setMode] = useState<'auto' | 'all' | 'none'>('auto')
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map())
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    pdf
      .getOutline()
      .then((items) => resolveOutline(pdf, items))
      .then((nodes) => !cancelled && setEmbedded(nodes))
      .catch(() => !cancelled && setEmbedded([]))
    return () => {
      cancelled = true
    }
  }, [pdf])

  const outline = embedded
  const all = useMemo(() => flattenAll(outline ?? []), [outline])
  const currentId = useMemo(() => {
    let id: string | null = null
    for (const n of all) if (n.page !== null && n.page <= currentPage) id = n.id
    return id
  }, [all, currentPage])
  const currentAncestors = useMemo(() => new Set(currentId ? ancestorsOf(currentId) : []), [currentId])
  const hasNested = all.some((n) => n.children.length)

  const isOpen = (id: string) => overrides.get(id) ?? (mode === 'all' ? true : mode === 'none' ? false : currentAncestors.has(id))
  const toggle = (id: string) => setOverrides((o) => new Map(o).set(id, !isOpen(id)))

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (q) {
      const keep = new Set<string>()
      for (const n of all) if (n.title.toLowerCase().includes(q)) [n.id, ...ancestorsOf(n.id)].forEach((id) => keep.add(id))
      return all.filter((n) => keep.has(n.id))
    }
    const out: FlatNode[] = []
    const walk = (nodes: OutlineNode[], depth: number) => {
      for (const n of nodes) {
        out.push({ ...n, depth })
        if (n.children.length && isOpen(n.id)) walk(n.children, depth + 1)
      }
    }
    walk(outline ?? [], 0)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, outline, filter, mode, overrides, currentAncestors])

  const activeRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentId])

  const allOpen = mode === 'all' && overrides.size === 0

  return (
    <div className="pb-6">
      <PanelHeader title="Contents">
        {hasNested && (
          <button
            type="button"
            onClick={() => {
              setMode(allOpen ? 'none' : 'all')
              setOverrides(new Map())
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold text-muted transition hover:bg-hover hover:text-ink"
          >
            {allOpen ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
            {allOpen ? 'Collapse all' : 'Show all'}
          </button>
        )}
      </PanelHeader>
      {outline === null ? (
        <Empty>Reading the table of contents…</Empty>
      ) : all.length === 0 ? (
        <>
          <Empty>This PDF doesn't include a table of contents. Bookmarks you add will show up here too.</Empty>
          <PageList book={book} currentPage={currentPage} onJump={onJump} />
        </>
      ) : (
        <>
          {all.length > 8 && (
            <div className="relative px-5 pb-2">
              <Search className="pointer-events-none absolute top-1/2 left-8 size-3.5 -translate-y-[60%] text-muted" />
              <input className={`${inputClass} py-1.5 pl-8 text-xs`} placeholder="Filter chapters" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          )}
          <ul className="px-2">
            {rows.map((n) => {
              const current = n.id === currentId
              const open = isOpen(n.id)
              return (
                <li key={n.id}>
                  <div
                    ref={current ? activeRef : undefined}
                    className={`group flex items-center rounded-md transition ${current ? 'bg-accent-soft text-accent-strong' : 'hover:bg-hover'}`}
                    style={{ paddingLeft: `${0.25 + n.depth * 0.85}rem` }}
                  >
                    {n.children.length > 0 && !filter ? (
                      <button
                        type="button"
                        aria-label={open ? `Collapse ${n.title}` : `Expand ${n.title}`}
                        aria-expanded={open}
                        onClick={() => toggle(n.id)}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:text-ink"
                      >
                        <ChevronRight className={`size-3.5 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} />
                      </button>
                    ) : (
                      <span className="size-6 shrink-0" />
                    )}
                    <button
                      type="button"
                      disabled={n.page === null}
                      onClick={() => n.page && onJump(n.page)}
                      className={`flex min-w-0 flex-1 items-baseline gap-2 py-1.5 pr-2 text-left text-sm ${n.depth === 0 ? 'font-semibold' : ''} ${
                        current ? 'font-bold' : currentAncestors.has(n.id) ? 'text-accent-strong' : n.depth > 0 ? 'text-ink/85' : ''
                      }`}
                    >
                      <span className="flex-1">{n.title}</span>
                      {n.page && <span className="text-xs font-normal text-muted tabular-nums">{n.page}</span>}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
          {filter && rows.length === 0 && <Empty>No chapters match “{filter}”.</Empty>}
        </>
      )}
    </div>
  )
}

function PageList({ book, currentPage, onJump }: Pick<SidebarProps, 'book' | 'currentPage' | 'onJump'>) {
  if (!book.bookmarks.length) return null
  return (
    <ul className="px-2">
      {[...book.bookmarks]
        .sort((a, b) => a.page - b.page)
        .map((b) => (
          <li key={b.page}>
            <button
              type="button"
              onClick={() => onJump(b.page)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-hover ${b.page === currentPage ? 'text-accent-strong' : ''}`}
            >
              <Bookmark className="size-3.5 text-accent" />
              <span className="flex-1 truncate">{b.label || `Page ${b.page}`}</span>
              <span className="text-xs text-muted">{b.page}</span>
            </button>
          </li>
        ))}
    </ul>
  )
}