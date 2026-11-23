import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { ago } from "@/lib/format";
import { Avatar } from "./avatar";
import { addComment, deleteComment } from "@/app/actions/social";
import { ReportButton } from "./client/report-button";

type Row = {
  id: string; body: string; created_at: string; parent_id: string | null; author_id: string;
  author: { handle: string; display_name: string; avatar_url: string | null } | null;
};

export async function Comments({ postId, postAuthorId }: { postId: string; postAuthorId: string }) {
  const { supabase, user } = await getUser();
  const { data } = await supabase.from("comments")
    .select("id, body, created_at, parent_id, author_id, author:profiles!comments_author_id_fkey(handle, display_name, avatar_url)")
    .eq("post_id", postId).order("created_at", { ascending: true }).limit(200);
  const rows = (data ?? []) as unknown as Row[];
  const top = rows.filter((r) => !r.parent_id);
  const replies = (pid: string) => rows.filter((r) => r.parent_id === pid);

  const box = (parentId?: string) => user ? (
    <form action={addComment} className="mt-2 flex gap-2">
      <input type="hidden" name="postId" value={postId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <input name="body" required maxLength={1000} placeholder={parentId ? "Reply…" : "Add a comment…"}
        className="flex-1 rounded-full border border-neutral-300 px-4 py-2 text-sm" />
      <button className="rounded-full bg-blue-600 px-4 text-sm font-semibold text-white">Post</button>
    </form>
  ) : null;

  const item = (c: Row) => (
    <div className="flex gap-2">
      <Avatar profile={c.author} size={28} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link href={`/u/${c.author?.handle}`} className="font-semibold">{c.author?.display_name}</Link>{" "}
          <span className="text-neutral-500">{ago(c.created_at)}</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
        <div className="flex gap-3 text-xs text-neutral-500">
          {user && (user.id === c.author_id || user.id === postAuthorId) && (
            <form action={deleteComment}><input type="hidden" name="commentId" value={c.id} /><button>Delete</button></form>
          )}
          {user && user.id !== c.author_id && <ReportButton target="comment" targetId={c.id} />}
        </div>
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-xl bg-white px-4 py-4 text-neutral-900">
      <h2 className="font-semibold">Comments</h2>
      {box() ?? <p className="mt-2 text-sm"><Link href="/login" className="text-blue-600">Sign in</Link> to comment.</p>}
      <ul className="mt-4 flex flex-col gap-4">
        {top.map((c) => (
          <li key={c.id}>
            {item(c)}
            <ul className="ml-9 mt-2 flex flex-col gap-3">{replies(c.id).map((r) => <li key={r.id}>{item(r)}</li>)}</ul>
            <div className="ml-9">{box(c.id)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
