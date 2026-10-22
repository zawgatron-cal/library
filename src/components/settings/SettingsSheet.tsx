import { useEffect, useState, type ReactNode } from 'react'
import { Check, Palette, Pencil, Plus, Trash2 } from 'lucide-react'
import { useSettings } from '../../lib/settings'
import { UI_FONTS, type Roundness, type UiFont } from '../../lib/preferences'
import { isDark, type Theme, type ThemeColors } from '../../lib/themes'
import { formatBytes } from '../../lib/format'
import { Button, Field, Segmented, Sheet, Toggle, inputClass } from '../ui/primitives'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings()

  return (
    <Sheet title="Make it yours" onClose={onClose}>
      <p className="-mt-1 mb-6 text-sm text-muted">Everything here is saved on this computer and applies instantly.</p>

      <Section title="Theme">
        <ThemePicker />
      </Section>

      <Section title="Pages">
        <div className="space-y-5">
          <Field label="Page colour">
            <Segmented
              value={settings.pageMode}
              onChange={(pageMode) => update({ pageMode })}
              options={[
                { value: 'auto', label: 'Match theme' },
                { value: 'original', label: 'Original' },
                { value: 'tint', label: 'Warm tint' },
                { value: 'night', label: 'Night' },
              ]}
            />
          </Field>
          <Slider label="Tint strength" value={settings.tintStrength} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={(tintStrength) => update({ tintStrength })} />
          <Slider label="Space between pages" value={settings.pageGap} min={0} max={56} step={4} format={(v) => `${v}px`} onChange={(pageGap) => update({ pageGap })} />
          <Toggle label="Two-page spread" hint="Read side-by-side like an open book." checked={settings.spread} onChange={(spread) => update({ spread })} />
        </div>
      </Section>

      <Section title="Comfort">
        <div className="space-y-5">
          <Field label="Interface font">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(UI_FONTS) as UiFont[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => update({ uiFont: key })}
                  title={UI_FONTS[key].note}
                  className={`rounded-md border px-2 py-2.5 text-center transition ${
                    settings.uiFont === key ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'
                  }`}
                >
                  <span className="block text-xl leading-tight" style={{ fontFamily: UI_FONTS[key].family }}>
                    Aa
                  </span>
                  <span className="block text-[0.7rem] font-semibold text-muted">{UI_FONTS[key].label}</span>
                </button>
              ))}
            </div>
          </Field>
          <Slider label="Interface size" value={Math.round(settings.uiScale * 100)} min={85} max={120} step={5} format={(v) => `${v}%`} onChange={(v) => update({ uiScale: v / 100 })} />
          <Field label="Corners">
            <Segmented<Roundness>
              value={settings.roundness}
              onChange={(roundness) => update({ roundness })}
              options={[
                { value: 'crisp', label: 'Crisp' },
                { value: 'soft', label: 'Soft' },
                { value: 'round', label: 'Pillowy' },
              ]}
            />
          </Field>
          <Toggle label="Paper grain" hint="A faint texture, like real paper." checked={settings.grain} onChange={(grain) => update({ grain })} />
          <Toggle label="Reduce motion" hint="Turn off animations and smooth scrolling." checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
        </div>
      </Section>

      <Section title="Reading goal">
        <Slider
          label="Daily goal"
          value={settings.dailyGoalMinutes}
          min={5}
          max={120}
          step={5}
          format={(v) => `${v} min`}
          onChange={(dailyGoalMinutes) => update({ dailyGoalMinutes })}
        />
      </Section>

      <Section title="Storage">
        <StorageInfo />
      </Section>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-6 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="mb-4 font-display text-lg font-medium">{title}</h3>
      {children}
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="text-muted tabular-nums">{format(value)}</span>
      </span>
      <input type="range" className="w-full" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'canvas', label: 'Background', hint: 'Behind everything' },
  { key: 'surface', label: 'Surface', hint: 'Cards & panels' },
  { key: 'ink', label: 'Ink', hint: 'Main text' },
  { key: 'muted', label: 'Pencil', hint: 'Quiet text' },
  { key: 'accent', label: 'Accent', hint: 'Buttons & progress' },
  { key: 'paper', label: 'Paper', hint: 'Page tint colour' },
]

function ThemePicker() {
  const { settings, update, themes, theme } = useSettings()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = settings.customThemes.find((t) => t.id === editingId)

  const saveCustom = (next: Theme) =>
    update({ customThemes: settings.customThemes.map((t) => (t.id === next.id ? next : t)) })

  const createFrom = (base: Theme) => {
    const custom: Theme = {
      id: `custom-${crypto.randomUUID().slice(0, 8)}`,
      name: base.custom ? `${base.name} copy` : `My ${base.name}`,
      blurb: 'Your own blend.',
      colors: { ...base.colors },
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
          Blend your own
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
                <span className="relative size-8 shrink-0 overflow-hidden rounded-full border border-line-strong shadow-soft" style={{ background: editing.colors[key] }}>
                  <input
                    type="color"
                    value={editing.colors[key]}
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
            <div className="size-3.5 rounded-full" style={{ background: c.accent }} />
          </div>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5" style={{ background: c.surface, color: c.ink }}>
          <span className="truncate text-xs font-bold">{theme.name}</span>
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

function StorageInfo() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }))
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted">
        Your books, highlights and notes live only in this browser on this computer. Nothing is uploaded anywhere.
      </p>
      {usage && (
        <p>
          Using <strong>{formatBytes(usage.used)}</strong>
          {usage.quota > 0 && <span className="text-muted"> of {formatBytes(usage.quota)} available</span>}
        </p>
      )}
      {persisted === false && (
        <div className="rounded-md bg-accent-soft p-3">
          <p className="mb-2 text-accent-strong">Browsers may clear storage when space runs low. Ask to keep your library safe:</p>
          <Button size="sm" variant="primary" onClick={() => navigator.storage.persist().then(setPersisted)}>
            Keep my library
          </Button>
        </div>
      )}
      {persisted && <p className="text-muted">✓ Protected from automatic clean-up.</p>}
    </div>
  )
}
