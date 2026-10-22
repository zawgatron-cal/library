import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

type ButtonVariant = 'primary' | 'soft' | 'ghost' | 'outline' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong shadow-soft',
  soft: 'bg-accent-soft text-accent-strong hover:brightness-[0.97]',
  ghost: 'text-ink hover:bg-hover',
  outline: 'border border-line-strong text-ink hover:bg-hover',
  danger: 'bg-[color-mix(in_oklab,#c0503c_14%,var(--surface))] text-[color-mix(in_oklab,#b2412e_80%,var(--ink))] hover:brightness-95',
}

export function Button({
  variant = 'outline',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[background-color,filter,color] disabled:pointer-events-none disabled:opacity-40 ${
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9.5 px-4 text-sm'
      } ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function IconButton({
  label,
  active = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-35 [&_svg]:size-[1.1rem] ${
        active ? 'bg-accent-soft text-accent-strong' : 'text-muted hover:bg-hover hover:text-ink'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
}

export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  useEscape(onClose)
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in bg-[color-mix(in_oklab,var(--ink)_28%,transparent)] backdrop-blur-[2px]" onClick={onClose} />
      <div role="dialog" aria-label={title} className={`relative w-full ${width} animate-rise rounded-xl border border-line bg-surface shadow-lifted`}>
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="font-display text-xl font-medium">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X />
          </IconButton>
        </div>
        <div className="px-6 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEscape(onClose)
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-[color-mix(in_oklab,var(--ink)_18%,transparent)]" onClick={onClose} />
      <aside role="dialog" aria-label={title} className="relative flex h-full w-full max-w-[26rem] animate-slide-in flex-col border-l border-line bg-surface shadow-lifted">
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="font-display text-2xl font-medium">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-8">{children}</div>
      </aside>
    </div>,
    document.body,
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold tracking-wide text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-md border border-line bg-canvas/60 px-3 py-2 text-sm text-ink placeholder:text-muted/70 outline-none transition focus:border-accent focus:ring-3 focus:ring-accent/15'

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-md bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[calc(var(--radius-md)-0.2rem)] px-2.5 py-1.5 text-xs font-semibold transition ${
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-4 py-1 text-left">
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={`relative h-6 w-10.5 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line-strong'}`}>
        <span className={`absolute top-1 size-4 rounded-full bg-surface shadow-soft transition-[left] ${checked ? 'left-5.5' : 'left-1'}`} />
      </span>
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border border-line-strong bg-canvas px-1.5 py-0.5 font-sans text-[0.7rem] font-bold text-muted shadow-[0_1px_0_var(--color-line-strong)]">{children}</kbd>
}
