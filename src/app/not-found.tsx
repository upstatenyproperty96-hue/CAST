import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <p className="text-neutral-600">This page or video doesn&apos;t exist, or it isn&apos;t available to you.</p>
      <Link href="/" className="rounded-full bg-blue-600 px-5 py-2 font-semibold text-white">Go home</Link>
    </main>
  );
}
