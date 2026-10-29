import type { ReactNode } from 'react'
import { Bookmark, GalleryVertical, Highlighter, ListTree, NotebookPen, Search, X } from 'lucide-react'
import { IconButton } from '../ui/primitives'
import { PagesPanel } from './PagesPanel'
import { AnnotationsPanel } from './sidebar/AnnotationsPanel'
import { BookmarksPanel } from './sidebar/BookmarksPanel'
import { ContentsPanel } from './sidebar/ContentsPanel'
import { NotesPanel } from './sidebar/NotesPanel'
import { SearchPanel } from './sidebar/SearchPanel'
import { type SidebarProps, type SidebarTab } from './sidebar/shared'

export type { SidebarTab }

const TABS: { id: SidebarTab; label: string; icon: ReactNode }[] = [
  { id: 'contents', label: 'Contents', icon: <ListTree /> },
  { id: 'pages', label: 'Pages (P)', icon: <GalleryVertical /> },
  { id: 'search', label: 'Search', icon: <Search /> },
  { id: 'annotations', label: 'Annotations', icon: <Highlighter /> },
  { id: 'bookmarks', label: 'Bookmarks', icon: <Bookmark /> },
  { id: 'notes', label: 'Notes', icon: <NotebookPen /> },
]

export function Sidebar(props: SidebarProps) {
  const { tab, onTab, onClose } = props
  return (
    <aside className="flex h-full w-80 shrink-0 animate-fade-in flex-col border-r border-line bg-surface">
      <nav className="flex items-center gap-0.5 border-b border-line px-2 py-2" aria-label="Sidebar">
        {TABS.map((t) => (
          <IconButton key={t.id} label={t.label} active={tab === t.id} onClick={() => onTab(t.id)}>
            {t.icon}
          </IconButton>
        ))}
        <IconButton label="Close sidebar" onClick={onClose} className="ml-auto">
          <X />
        </IconButton>
      </nav>
      <div data-sidebar-scroll className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'contents' && <ContentsPanel {...props} />}
        {tab === 'pages' && <PagesPanel {...props} />}
        {tab === 'search' && <SearchPanel {...props} />}
        {tab === 'annotations' && <AnnotationsPanel {...props} />}
        {tab === 'bookmarks' && <BookmarksPanel {...props} />}
        {tab === 'notes' && <NotesPanel {...props} />}
      </div>
    </aside>
  )
}
