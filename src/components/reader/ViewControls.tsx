import { ArrowDownUp, ArrowLeftRight, BookOpen, File, PanelRight, Rows3 } from 'lucide-react'
import type { PageLayout, ScrollDirection } from '../../lib/preferences'
import { Popover } from '../ui/Menu'
import { IconButton, Toggle } from '../ui/primitives'
import { clampZoom } from './layout'

const ZOOM_PRESETS = [0.75, 1, 1.25, 1.5, 2]

export function ZoomControl({ zoom, isFit, onZoom }: { zoom: number; isFit: boolean; onZoom: (z: number | 'fit') => void }) {
  return (
    <Popover
      align="center"
      className="w-64"
      trigger={({ onClick, open }) => (
        <button
          type="button"
          onClick={onClick}
          title="Zoom"
          className={`w-14 rounded-md py-1.5 text-xs font-bold tabular-nums transition ${open ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-hover hover:text-ink'}`}
        >
          {isFit ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </button>
      )}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-bold tracking-wide text-muted uppercase">Zoom</span>
        <span className="text-sm font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
      </div>
      <input
        type="range"
        aria-label="Zoom"
        className="w-full"
        min={-2}
        max={2}
        step={0.01}
        value={Math.log2(zoom)}
        onChange={(e) => onZoom(clampZoom(2 ** Number(e.target.value)))}
      />
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip active={isFit} onClick={() => onZoom('fit')}>
          Fit
        </Chip>
        {ZOOM_PRESETS.map((z) => (
          <Chip key={z} active={!isFit && Math.abs(zoom - z) < 0.005} onClick={() => onZoom(z)}>
            {z * 100}%
          </Chip>
        ))}
      </div>
      <p className="mt-2.5 text-[0.7rem] leading-snug text-muted">Pinch or hold Ctrl/⌘ while scrolling to zoom around your cursor.</p>
    </Popover>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${active ? 'bg-accent text-on-accent' : 'bg-sunken text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon: React.ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[0.7rem] font-bold transition [&_svg]:size-4 ${
            value === o.value ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line text-muted hover:bg-hover hover:text-ink'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ViewMenu({
  layout,
  direction,
  margins,
  onChange,
}: {
  layout: PageLayout
  direction: ScrollDirection
  margins: boolean
  onChange: (patch: { pageLayout?: PageLayout; scrollDirection?: ScrollDirection; margins?: boolean }) => void
}) {
  return (
    <Popover
      className="w-72 space-y-4"
      trigger={({ onClick, open }) => (
        <IconButton label="Page layout" active={open} onClick={onClick}>
          {layout === 'double' ? <BookOpen /> : layout === 'single' ? <File /> : <Rows3 className={direction === 'horizontal' ? 'rotate-90' : ''} />}
        </IconButton>
      )}
    >
      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Pages</p>
        <Choice
          value={layout}
          onChange={(pageLayout) => onChange({ pageLayout })}
          options={[
            { value: 'continuous', label: 'Continuous', icon: <Rows3 /> },
            { value: 'single', label: 'One page', icon: <File /> },
            { value: 'double', label: 'Two pages', icon: <BookOpen /> },
          ]}
        />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-bold tracking-wide text-muted uppercase">Scroll</p>
        <Choice
          value={direction}
          onChange={(scrollDirection) => onChange({ scrollDirection })}
          options={[
            { value: 'vertical', label: 'Vertical', icon: <ArrowDownUp /> },
            { value: 'horizontal', label: 'Horizontal', icon: <ArrowLeftRight /> },
          ]}
        />
      </div>
      <div className="border-t border-line pt-3">
        <Toggle label="Margin notes" hint="Show annotations beside each page." checked={margins} onChange={(m) => onChange({ margins: m })} />
      </div>
      <p className="flex items-center gap-1.5 text-[0.7rem] text-muted">
        <PanelRight className="size-3" /> Shortcuts: D two pages · V direction · M margins
      </p>
    </Popover>
  )
}
