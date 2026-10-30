import { FolderOpen, Library } from 'lucide-react'
import { Button, Dialog } from '../ui/primitives'

export function ShelfSetupDialog({
  folderPath,
  onEnable,
  onSkip,
}: {
  folderPath: string
  onEnable: () => void
  onSkip: () => void
}) {
  return (
    <Dialog title="Keep your books in one place" onClose={onSkip} width="max-w-md">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-accent-soft/60 p-3">
          <Library className="mt-0.5 size-5 shrink-0 text-accent" />
          <p className="text-sm leading-relaxed text-ink">
            Library can keep every PDF in a folder on this computer —{' '}
            <span className="font-semibold break-all">{folderPath}</span>. Your shelves will read from there.
          </p>
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>PDFs you add are copied into that folder.</li>
          <li>Drop files into it in Finder/Explorer and they’ll show up on your shelves.</li>
          <li>Books already in the app can be moved there next.</li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onSkip}>
            Not now
          </Button>
          <Button variant="primary" onClick={onEnable}>
            <FolderOpen className="size-3.5" /> Use Documents/Library
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
