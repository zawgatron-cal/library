export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="9" fill="var(--accent)" />
      <path
        d="M9 10.5c2.6-.9 5-.6 7 1v11c-2-1.4-4.4-1.7-7-.9zM23 10.5c-2.6-.9-5-.6-7 1v11c2-1.4 4.4-1.7 7-.9z"
        fill="var(--on-accent)"
        opacity="0.95"
      />
      <path d="M19.5 10.6v5.2l1.3-1 1.3 1v-5.4" fill="var(--accent)" opacity="0.9" />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.35rem] font-medium tracking-tight">Library</span>
    </span>
  )
}
