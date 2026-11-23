import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-8 leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-2">
      <Link href="/" className="text-sm text-blue-600">← Cast</Link>
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="text-sm text-neutral-500">Last updated {updated}</p>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Beta draft. This page will be reviewed by a lawyer before Cast opens to the public.</p>
      {children}
      <nav className="mt-10 flex gap-4 text-sm text-blue-600">
        <Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/copyright">Copyright</Link>
      </nav>
    </main>
  );
}

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "the contact address listed in the Cast app";
