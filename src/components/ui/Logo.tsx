import logo from '../../assets/logo.webp'

export function LogoMark({ className = 'size-10' }: { className?: string }) {
  return <img src={logo} alt="" width={40} height={40} decoding="async" className={`${className} rounded-[13px] bg-white shadow-soft ring-1 ring-line/80`} />
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-3">
      <LogoMark />
      <span className="font-display text-[1.7rem] leading-none font-medium italic">Library</span>
    </span>
  )
}
