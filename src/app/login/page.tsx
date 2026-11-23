import { Suspense } from "react";
import { sendMagicLink, signInWithProvider } from "./actions";
import { Logo } from "@/components/logo";

const errors: Record<string, string> = {
  email: "Enter a valid email address.",
  send: "We couldn't send the link. Try again in a minute.",
  provider: "That sign-in option isn't available right now.",
  signin: "That sign-in link expired. Request a new one.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <Logo className="mx-auto" />
      <p className="text-center text-neutral-600">Video-first. Create, share, and grow on Cast.</p>
      <Suspense fallback={null}>
        <LoginForms searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function LoginForms({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const sent = one(sp.sent), error = one(sp.error), next = one(sp.next);
  return (
    <>
      {sent ? (
        <p className="rounded-xl bg-blue-50 p-4 text-center text-blue-900">Check your email for a sign-in link.</p>
      ) : (
        <>
          <form action={sendMagicLink} className="flex flex-col gap-3">
            <input type="hidden" name="next" value={next ?? "/"} />
            <label className="text-sm font-medium" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email"
              className="rounded-full border border-neutral-300 px-4 py-3" placeholder="you@example.com" />
            <button className="rounded-full bg-blue-600 py-3 font-semibold text-white">Get started</button>
          </form>
          <div className="flex flex-col gap-2">
            {(["apple", "google"] as const).map((p) => (
              <form key={p} action={signInWithProvider}>
                <input type="hidden" name="provider" value={p} />
                <input type="hidden" name="next" value={next ?? "/"} />
                <button className="w-full rounded-full border border-neutral-300 py-3 font-medium">
                  Continue with {p === "apple" ? "Apple" : "Google"}
                </button>
              </form>
            ))}
          </div>
        </>
      )}
      {error && errors[error] && <p role="alert" className="text-center text-red-600">{errors[error]}</p>}
    </>
  );
}
