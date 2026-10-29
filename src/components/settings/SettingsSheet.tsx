import type { ReactNode } from 'react'
import { useSettings } from '../../lib/settings'
import { UI_FONTS, type PageLayout, type Roundness, type ScrollDirection, type UiFont } from '../../lib/preferences'
import { Field, Segmented, Sheet, Toggle } from '../ui/primitives'
import { StorageInfo } from './StorageInfo'
import { ThemePicker } from './ThemePicker'

const REPO = 'https://github.com/zawgatron-cal/library'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings()

  return (
    <Sheet title="Settings" onClose={onClose}>
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
          <Field label="Pages">
            <Segmented<PageLayout>
              value={settings.pageLayout}
              onChange={(pageLayout) => update({ pageLayout })}
              options={[
                { value: 'continuous', label: 'Continuous' },
                { value: 'single', label: 'One page' },
                { value: 'double', label: 'Two pages' },
              ]}
            />
          </Field>
          <Field label="Scroll direction">
            <Segmented<ScrollDirection>
              value={settings.scrollDirection}
              onChange={(scrollDirection) => update({ scrollDirection })}
              options={[
                { value: 'vertical', label: 'Vertical' },
                { value: 'horizontal', label: 'Horizontal' },
              ]}
            />
          </Field>
          <Toggle label="Margin notes" hint="Show your annotations neatly beside each page." checked={settings.margins} onChange={(margins) => update({ margins })} />
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

      <Section title="Storage">
        <StorageInfo />
      </Section>

      <Section title="About">
        <p className="text-sm leading-relaxed text-muted">
          <span className="font-display text-base text-ink italic">Library</span> {__APP_VERSION__} is free and open source under the MIT License, and is
          built on the work of many other open-source projects. The desktop app checks for updates from GitHub Releases
          after launch.
        </p>
        <p className="mt-2 flex gap-4 text-sm font-semibold">
          <a className="text-accent-strong hover:underline" href={REPO} target="_blank" rel="noreferrer">
            Source code
          </a>
          <a className="text-accent-strong hover:underline" href={`${REPO}/blob/v${__APP_VERSION__}/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noreferrer">
            Licenses &amp; credits
          </a>
        </p>
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
