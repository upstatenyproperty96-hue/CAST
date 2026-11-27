// The Cast mark: five audio bars. Sizes follow the text size set by the caller.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-3xl font-bold lowercase tracking-tighter text-neutral-950 ${className}`}>
      <span className="flex h-[1.15em] w-[1.15em] items-center justify-center rounded-[28%] bg-[#06140f] ring-1 ring-white/10" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="h-full w-full fill-[#22d9a4]">
          <rect x="17.5" y="35.0" width="9" height="30" rx="4.5" />
          <rect x="31.5" y="24.0" width="9" height="52" rx="4.5" />
          <rect x="45.5" y="16.0" width="9" height="68" rx="4.5" />
          <rect x="59.5" y="28.0" width="9" height="44" rx="4.5" />
          <rect x="73.5" y="39.0" width="9" height="22" rx="4.5" />
        </svg>
      </span>
      cast
    </span>
  );
}
