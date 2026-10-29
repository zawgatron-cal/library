import logo from '../../assets/logo.webp'

export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return <img src={logo} alt="" width={40} height={40} decoding="async" className={`${className} border border-ink bg-white`} />
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-3">
      <LogoMark />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[1.85rem] font-medium tracking-tight italic">Library</span>
        <span className="mt-1 text-[0.58rem] font-bold tracking-[0.28em] text-muted uppercase">A reading room</span>
      </span>
    </span>
  )
}
