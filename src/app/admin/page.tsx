import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { profileFlags } from "@/lib/access";
import { ago } from "@/lib/format";
import { dismissReport, takeDown, createInvite } from "@/app/actions/admin";

export default function AdminPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <Link href="/" className="text-sm text-blue-600">← Home</Link>
      <h1 className="my-4 text-2xl font-bold">Admin</h1>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}><Inner /></Suspense>
    </div>
  );
}

type Report = {
  id: number; reason: string; created_at: string; post_id: string | null; comment_id: string | null; user_id: string | null;
  reporter: { handle: string } | null;
  post: { body: string; video_id: string | null; author: { handle: string } | null } | null;
  comment: { body: string } | null;
  user: { handle: string } | null;
};

async function Inner() {
  const { supabase, user } = await getUser();
  if (!user || !(await profileFlags(supabase, user.id)).isAdmin) notFound();

  const [{ data: reports }, { data: invites }] = await Promise.all([
    supabase.from("reports").select(
      "id, reason, created_at, post_id, comment_id, user_id, reporter:profiles!reports_reporter_id_fkey(handle), " +
      "post:posts(body, video_id, author:profiles!posts_author_id_fkey(handle)), comment:comments(body), user:profiles!reports_user_id_fkey(handle)",
    ).eq("status", "open").order("created_at").limit(100),
    supabase.from("invite_codes").select("code, note, uses, max_uses, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const rows = (reports ?? []) as unknown as Report[];

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold">Open reports ({rows.length})</h2>
        {!rows.length && <p className="text-neutral-500">Nothing to review.</p>}
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-neutral-200 p-4">
              <p className="text-sm text-neutral-500">{r.reason} · reported by @{r.reporter?.handle} · {ago(r.created_at)}</p>
              {r.post && (
                <p className="mt-1">Post by @{r.post.author?.handle}: {r.post.body || "(video)"}{" "}
                  {r.post.video_id && <Link className="text-blue-600" href={`/v/${r.post.video_id}`}>Watch</Link>}</p>
              )}
              {r.comment && <p className="mt-1">Comment: {r.comment.body}</p>}
              {r.user && <p className="mt-1">Account: <Link className="text-blue-600" href={`/u/${r.user.handle}`}>@{r.user.handle}</Link></p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {!r.user_id && (
                  <form action={takeDown} className="flex gap-2">
                    <input type="hidden" name="reportId" value={r.id} />
                    <input name="reason" placeholder="Reason shown to the creator" className="rounded-lg border border-neutral-300 px-2 py-1 text-sm" />
                    <button className="rounded-lg bg-red-600 px-3 py-1 text-sm text-white">Remove</button>
                  </form>
                )}
                <form action={dismissReport}>
                  <input type="hidden" name="reportId" value={r.id} />
                  <button className="rounded-lg border border-neutral-300 px-3 py-1 text-sm">Dismiss</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Creator invites</h2>
        <form action={createInvite} className="mb-4 flex flex-wrap gap-2">
          <input name="note" maxLength={200} placeholder="Who it's for" className="rounded-lg border border-neutral-300 px-3 py-2" />
          <input name="maxUses" type="number" min={1} max={1000} defaultValue={1} className="w-24 rounded-lg border border-neutral-300 px-3 py-2" />
          <button className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Create code</button>
        </form>
        <table className="w-full text-left text-sm">
          <thead><tr className="text-neutral-500"><th className="py-1">Code</th><th>For</th><th>Used</th></tr></thead>
          <tbody>
            {invites?.map((i) => (
              <tr key={i.code} className="border-t border-neutral-100">
                <td className="py-2 font-mono">{i.code}</td><td>{i.note}</td><td>{i.uses} of {i.max_uses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
