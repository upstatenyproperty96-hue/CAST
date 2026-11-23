import { Suspense } from "react";
import { redeemInvite } from "@/app/actions/beta";
import { Logo } from "@/components/logo";

export default function InvitePage({ searchParams }: PageProps<"/invite">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-5 px-6">
      <Logo className="mx-auto" />
      <h1 className="text-center text-2xl font-bold">Creator beta</h1>
      <p className="text-center text-neutral-600">Publishing on Cast is invite-only during the beta. Enter the code you were given.</p>
      <form action={redeemInvite} className="flex flex-col gap-3">
        <input name="code" required maxLength={20} autoCapitalize="characters" placeholder="INVITE CODE"
          className="rounded-full border border-neutral-300 px-4 py-3 text-center uppercase tracking-widest" />
        <button className="rounded-full bg-blue-600 py-3 font-semibold text-white">Unlock Studio</button>
      </form>
      <Suspense fallback={null}><ErrorLine searchParams={searchParams} /></Suspense>
    </main>
  );
}

async function ErrorLine({ searchParams }: { searchParams: PageProps<"/invite">["searchParams"] }) {
  const sp = await searchParams;
  return sp.error ? <p role="alert" className="text-center text-red-600">That code didn&apos;t work. Check it and try again.</p> : null;
}
