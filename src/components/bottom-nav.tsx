import Link from "next/link";

export function BottomNav({ handle }: { handle?: string | null }) {
  const item = "flex flex-1 flex-col items-center py-2 text-xs text-neutral-600";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <Link href="/" className={item}><span className="text-xl">⌂</span>Home</Link>
      <Link href="/search" className={item}><span className="text-xl">⌕</span>Search</Link>
      <Link href="/studio" className={item} aria-label="Create">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-xl text-white">+</span>
      </Link>
      <Link href="/notifications" className={item}><span className="text-xl">♢</span>Alerts</Link>
      <Link href={handle ? `/u/${handle}` : "/login"} className={item}><span className="text-xl">◯</span>Profile</Link>
    </nav>
  );
}
