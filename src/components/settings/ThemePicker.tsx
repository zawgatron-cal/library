import { useState } from 'react'
import { Check, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { useSettings } from '../../lib/settings'
import { flourishOf, isDark, type Theme, type ThemeColors } from '../../lib/themes'
import { Button, inputClass } from '../ui/primitives'

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'canvas', label: 'Background', hint: 'Behind everything' },
  { key: 'surface', label: 'Surface', hint: 'Cards & panels' },
  { key: 'ink', label: 'Ink', hint: 'Main text' },
  { key: 'muted', label: 'Pencil', hint: 'Quiet text' },
  { key: 'accent', label: 'Accent', hint: 'Buttons & ribbons' },
  { key: 'flourish', label: 'Flourish', hint: 'Progress & gilt details' },
  { key: 'paper', label: 'Paper', hint: 'Page tint colour' },
]

export function ThemePicker() {
  const { settings, update, themes, theme } = useSettings()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = settings.customThemes.find((t) => t.id === editingId)

  const saveCustom = (next: Theme) =>
    update({ customThemes: settings.customThemes.map((t) => (t.id === next.id ? next : t)) })

  const createFrom = (base: Theme) => {
    const custom: Theme = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      name: base.custom ? `${base.name} copy` : `My ${base.name}`,
      blurb: 'Made by you.',
      colors: { ...base.colors, flourish: flourishOf(base.colors) },
      custom: true,
    }
    update({ customThemes: [...settings.customThemes, custom], themeId: custom.id })
    setEditingId(custom.id)
  }

  const remove = (id: string) => {
    update({
      customThemes: settings.customThemes.filter((t) => t.id !== id),
      themeId: settings.themeId === id ? themes[0].id : settings.themeId,
    })
    if (editingId === id) setEditingId(null)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {themes.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            active={t.id === theme.id}
            onSelect={() => update({ themeId: t.id })}
            onEdit={t.custom ? () => setEditingId(t.id === editingId ? null : t.id) : undefined}
          />
        ))}
        <button
          type="button"
          onClick={() => createFrom(theme)}
          className="flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-sm font-semibold text-muted transition hover:border-accent hover:text-accent-strong"
        >
          <Plus className="size-4" />
          Create your own
        </button>
      </div>

      {editing && (
        <div className="mt-4 animate-rise rounded-lg border border-line bg-canvas/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="size-4 text-accent" />
            <input
              className={`${inputClass} py-1.5 font-display text-base`}
              value={editing.name}
              onChange={(e) => saveCustom({ ...editing, name: e.target.value })}
              aria-label="Theme name"
            />
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
            {COLOR_FIELDS.map(({ key, label, hint }) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 rounded-md p-1 hover:bg-hover">
                <span
                  className="relative size-8 shrink-0 overflow-hidden rounded-full border border-line-strong shadow-soft"
                  style={{ background: editing.colors[key] ?? flourishOf(editing.colors) }}
                >
                  <input
                    type="color"
                    value={editing.colors[key] ?? flourishOf(editing.colors)}
                    onChange={(e) => saveCustom({ ...editing, colors: { ...editing.colors, [key]: e.target.value } })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-tight font-semibold">{label}</span>
                  <span className="block truncate text-[0.7rem] text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-between">
            <Button size="sm" variant="danger" onClick={() => remove(editing.id)}>
              <Trash2 className="size-3.5" /> Delete
            </Button>
            <Button size="sm" variant="soft" onClick={() => setEditingId(null)}>
              <Check className="size-3.5" /> Done
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ThemeCard({ theme, active, onSelect, onEdit }: { theme: Theme; active: boolean; onSelect: () => void; onEdit?: () => void }) {
  const c = theme.colors
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        title={theme.blurb}
        className={`w-full overflow-hidden rounded-lg border-2 text-left transition ${active ? 'border-accent shadow-soft' : 'border-transparent hover:border-line-strong'}`}
      >
        <div className="flex h-14 gap-1.5 p-2" style={{ background: c.canvas }}>
          <div className="flex-1 rounded-[0.35rem] p-1.5" style={{ background: c.paper, boxShadow: `0 1px 2px ${c.ink}22` }}>
            <div className="mb-1 h-1 w-3/4 rounded-full" style={{ background: c.ink, opacity: isDark(c) ? 0.8 : 0.7 }} />
            <div className="mb-1 h-1 w-full rounded-full" style={{ background: c.muted, opacity: 0.6 }} />
            <div className="h-1 w-2/3 rounded-full" style={{ background: c.muted, opacity: 0.6 }} />
          </div>
          <div className="flex w-5 flex-col items-center justify-end gap-1">
            <div className="size-3.5 rounded-full" style={{ background: c.flourish ?? c.accent }} />
            <div className="size-3.5 rounded-full" style={{ background: c.accent }} />
          </div>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: c.surface, color: c.ink }}>
          <span className="truncate font-display text-[0.95rem] font-medium">{theme.name}</span>
          {active && <Check className="size-3.5 shrink-0" style={{ color: c.accent }} />}
        </div>
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${theme.name}`}
          className="absolute top-1.5 right-1.5 rounded-full p-1.5 opacity-0 shadow-soft transition group-hover:opacity-100 focus:opacity-100"
          style={{ background: c.surface, color: c.ink }}
        >
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  )
}
