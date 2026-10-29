import logo from '../../assets/logo.webp'

export function LogoMark({ className = 'size-10' }: { className?: string }) {
  return <img src={logo} alt="" width={40} height={40} decoding="async" className={`${className} rounded-md bg-white ring-1 ring-line`} />
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-[1.6rem] leading-none font-medium italic">Library</span>
    </span>
  )
}
