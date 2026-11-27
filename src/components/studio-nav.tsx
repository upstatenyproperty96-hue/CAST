import Link from "next/link";
import { Logo } from "./logo";

const items = [
  { href: "/studio", label: "Upload" },
  { href: "/studio/record", label: "Record" },
  { href: "/studio/live", label: "Go live" },
  { href: "/studio/library", label: "Library" },
  { href: "/studio/analytics", label: "Analytics" },
];

export function StudioNav({ active }: { active: string }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link href="/" className="flex items-center gap-2"><Logo className="!text-2xl" /><span className="text-lg font-semibold text-neutral-500">Studio</span></Link>
      <nav className="flex gap-4 text-sm">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={i.href === active ? "font-semibold text-blue-600" : "text-neutral-600"}>{i.label}</Link>
        ))}
      </nav>
    </header>
  );
}
