import { Dialog, Kbd } from '../ui/primitives'

const SHORTCUTS: [string[], string][] = [
  [['→', 'K'], 'Next page'],
  [['←', 'J'], 'Previous page'],
  [['I'], 'Scroll up (hold)'],
  [['O'], 'Scroll down (hold)'],
  [['G'], 'Go to page…'],
  [['⌫', 'Del'], 'Delete selected annotation'],
  [['⌫'], 'Back after a jump'],
  [['+', '−'], 'Zoom in / out'],
  [['0'], 'Fit'],
  [['D'], 'Two pages'],
  [['V'], 'Scroll direction'],
  [['M'], 'Margin notes'],
  [['R', '⇧R'], 'Rotate right / left'],
  [['B'], 'Bookmark page'],
  [['H'], 'Highlight selection'],
  [['A…'], 'Type to note on selection'],
  [['⌘↵'], 'Save note'],
  [['Esc'], 'Cancel note / close'],
  [['/'], 'Search in book'],
  [['T'], 'Toggle sidebar'],
  [['P'], 'Page thumbnails'],
  [['F'], 'Focus mode'],
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} width="max-w-lg">
      <ul className="grid grid-cols-1 gap-x-8 gap-y-2.5 text-sm sm:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-3">
            <span>{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
