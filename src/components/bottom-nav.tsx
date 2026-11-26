"use client";
import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Compass, House, Mail, Plus, Search, User } from "lucide-react";
import { Logo } from "./logo";

const items = [
  { href: "/", label: "Home", Icon: House, match: (p: string) => p === "/" },
  { href: "/search", label: "Search", Icon: Search, match: (p: string) => p.startsWith("/search") },
  { href: "/topics", label: "Explore", Icon: Compass, match: (p: string) => p.startsWith("/topics"), wideOnly: true },
  { href: "/notifications", label: "Alerts", Icon: Bell, match: (p: string) => p.startsWith("/notifications") },
  { href: "/messages", label: "Messages", Icon: Mail, match: (p: string) => p.startsWith("/messages"), wideOnly: true },
  { href: "/me", label: "Profile", Icon: User, match: (p: string) => p.startsWith("/u/") || p === "/me" },
];

// Bottom tab bar on phones; a left rail on wide screens.
export function BottomNav(props: { handle?: string | null }) {
  // usePathname needs a Suspense boundary on pages with a dynamic address.
  return <Suspense fallback={null}><Nav {...props} /></Suspense>;
}

function Nav({ handle }: { handle?: string | null }) {
  const path = usePathname();
  const hrefFor = (href: string) => (href === "/me" && handle ? `/u/${handle}` : href);
  const phone = items.filter((i) => !i.wideOnly);
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl items-center border-t border-neutral-200 bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        {phone.slice(0, 2).map((i) => <Tab key={i.href} {...i} href={hrefFor(i.href)} active={i.match(path)} />)}
        <Link href="/studio" aria-label="Create" className="flex flex-1 justify-center py-2">
          <span className="bg-brand flex h-10 w-14 items-center justify-center rounded-2xl text-white shadow-lg shadow-blue-600/30">
            <Plus size={24} strokeWidth={2.5} />
          </span>
        </Link>
        {phone.slice(2).map((i) => <Tab key={i.href} {...i} href={hrefFor(i.href)} active={i.match(path)} />)}
      </nav>

      <nav className="fixed left-[max(1rem,calc(50%-36rem))] top-0 z-20 hidden h-dvh w-60 flex-col gap-1 py-5 lg:flex">
        <Link href="/" className="mb-4 px-3"><Logo className="!text-2xl" /></Link>
        {items.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <Link key={href} href={hrefFor(href)}
              className={`flex items-center gap-4 rounded-full px-3 py-3 text-lg transition hover:bg-neutral-100 ${active ? "font-bold text-neutral-950" : "text-neutral-700"}`}>
              <Icon size={26} strokeWidth={active ? 2.5 : 1.8} />{label}
            </Link>
          );
        })}
        <Link href="/studio" className="bg-brand mt-4 rounded-full py-3 text-center text-lg font-bold text-white shadow-lg shadow-blue-600/20 transition hover:brightness-110">
          Create
        </Link>
      </nav>
    </>
  );
}

function Tab({ href, label, Icon, active }: { href: string; label: string; Icon: typeof House; active: boolean }) {
  return (
    <Link href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "text-neutral-950" : "text-neutral-500"}`}>
      <Icon size={24} strokeWidth={active ? 2.5 : 1.8} />
      {label}
    </Link>
  );
}
