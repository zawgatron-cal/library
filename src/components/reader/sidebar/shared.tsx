import type { ReactNode, RefObject } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Book, Highlight, OcrPage } from '../../../lib/db'
import type { PageSize } from '../layout'

export type SidebarTab = 'contents' | 'pages' | 'search' | 'annotations' | 'bookmarks' | 'notes'

export type SidebarProps = {
  tab: SidebarTab
  onTab: (tab: SidebarTab) => void
  onClose: () => void
  pdf: PDFDocumentProxy | null
  book: Book
  highlights: Highlight[]
  currentPage: number
  searchQuery: string
  onSearch: (query: string) => void
  onJump: (page: number, highlightId?: string) => void
  activeHighlightId: string | null
  pageSizes: PageSize[] | null
  pageLabels: string[] | null
  rotations: number[]
  ocrPages: ReadonlyMap<number, OcrPage>
  onRotatePage: (page: number) => void
  searchInputRef: RefObject<HTMLInputElement | null>
}

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <h3 className="font-display text-lg font-medium">{title}</h3>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-6 text-sm leading-relaxed text-muted">{children}</p>
}
