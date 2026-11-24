"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-neutral-600">Please try again.</p>
      <button onClick={reset} className="rounded-full bg-blue-600 px-5 py-2 font-semibold text-white">Try again</button>
    </main>
  );
}
