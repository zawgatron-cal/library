import type { ReactNode } from 'react'

/** Soft bookish ornaments. They inherit text colour so themes tint them. */

export function VineFlourish({ className = 'h-4 w-28 text-flourish' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 16" fill="none" aria-hidden>
      <path
        d="M2 8c12-6 20 6 32 0s20 6 32 0 20 6 32 0 14-4 20-2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path d="M28 8c2-4 6-5 8-2M60 8c2-4 6-5 8-2M92 8c2-4 6-5 8-2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
      <circle cx="32" cy="5" r="1.6" fill="currentColor" opacity="0.45" />
      <circle cx="64" cy="5" r="1.6" fill="currentColor" opacity="0.45" />
      <circle cx="96" cy="5" r="1.6" fill="currentColor" opacity="0.45" />
    </svg>
  )
}

export function OpenBookArt({ className = 'h-28 w-40 text-flourish' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 112" fill="none" aria-hidden>
      <ellipse cx="80" cy="100" rx="54" ry="6" fill="currentColor" opacity="0.08" />
      <path
        d="M80 22c-10-8-34-12-54-8v62c22-6 44 2 54 10 10-8 32-16 54-10V14c-20-4-44 0-54 8Z"
        fill="color-mix(in oklab, var(--surface) 88%, var(--flourish))"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.9"
      />
      <path d="M80 22v64" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <path d="M40 38h22M40 48h18M40 58h20M98 38h22M98 48h18M98 58h20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.28" />
      <path d="M26 28c8-10 22-12 30-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.35" />
      <path d="M134 28c-8-10-22-12-30-6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.35" />
    </svg>
  )
}

export function CornerVines({ className = '' }: { className?: string }) {
  return (
    <svg className={`pointer-events-none text-flourish ${className}`} viewBox="0 0 120 120" fill="none" aria-hidden>
      <path d="M8 112c4-40 28-72 72-88" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
      <path d="M20 96c10-8 18-6 22 2M36 72c8-10 18-8 24 0M56 48c10-8 18-4 20 6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.4" />
      <circle cx="42" cy="70" r="2" fill="currentColor" opacity="0.35" />
      <circle cx="62" cy="46" r="2.2" fill="currentColor" opacity="0.3" />
      <circle cx="28" cy="94" r="1.7" fill="currentColor" opacity="0.3" />
    </svg>
  )
}

export function LabelFlourish({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-3 text-xs font-bold tracking-wider text-flourish uppercase ${className}`}>
      <VineFlourish className="h-3.5 w-16 shrink-0 opacity-80" />
      <span>{children}</span>
      <VineFlourish className="h-3.5 w-16 shrink-0 scale-x-[-1] opacity-80" />
    </p>
  )
}
