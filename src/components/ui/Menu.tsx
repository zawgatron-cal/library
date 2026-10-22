import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Popover({
  trigger,
  children,
  align = 'right',
  className = '',
}: {
  trigger: (props: { onClick: () => void; open: boolean }) => ReactNode
  children: ReactNode | ((close: () => void) => ReactNode)
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const position = align === 'right' ? 'right-0' : align === 'left' ? 'left-0' : 'left-1/2 -translate-x-1/2'
  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), open })}
      {open && (
        <div className={`absolute top-full z-40 mt-2 ${position}`}>
          <div className={`animate-rise rounded-lg border border-line bg-surface p-3 shadow-lifted ${className}`}>
            {typeof children === 'function' ? children(() => setOpen(false)) : children}
          </div>
        </div>
      )}
    </div>
  )
}

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean }

export function Menu({ trigger, items, align = 'right' }: { trigger: (props: { onClick: () => void; open: boolean }) => ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      {trigger({ onClick: () => setOpen((o) => !o), open })}
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-1 min-w-44 animate-rise rounded-lg border border-line bg-surface p-1 shadow-lifted ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-semibold transition hover:bg-hover [&_svg]:size-4 ${
                item.danger ? 'text-[color-mix(in_oklab,#b2412e_80%,var(--ink))]' : 'text-ink [&_svg]:text-muted'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
