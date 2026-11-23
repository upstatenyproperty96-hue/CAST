import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ago } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { BottomNav } from "@/components/bottom-nav";
import { markNotificationsRead } from "@/app/actions/social";

const text: Record<string, string> = {
  follow: "followed you", like: "liked your post", repost: "reposted your post", comment: "commented on your post", new_upload: "posted a new video",
};

export default function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-xl font-bold">Notifications</h1>
        <form action={markNotificationsRead}><button className="text-sm text-blue-600">Mark all read</button></form>
      </div>
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><List /></Suspense>
      <BottomNav />
    </div>
  );
}

async function List() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/notifications");
  const { data } = await supabase.from("notifications")
    .select("id, kind, created_at, read_at, post_id, actor:profiles!notifications_actor_id_fkey(handle, display_name, avatar_url)")
    .order("created_at", { ascending: false }).limit(50);
  type Row = { id: number; kind: string; created_at: string; read_at: string | null; post_id: string | null; actor: { handle: string; display_name: string; avatar_url: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return <p className="p-6 text-center text-neutral-500">No notifications yet.</p>;
  return (
    <ul>
      {rows.map((n) => (
        <li key={n.id} className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 ${n.read_at ? "" : "bg-blue-50"}`}>
          <Avatar profile={n.actor} size={36} />
          <p className="flex-1 text-sm">
            <Link href={`/u/${n.actor?.handle}`} className="font-semibold">{n.actor?.display_name}</Link> {text[n.kind]}
          </p>
          <span className="text-xs text-neutral-500">{ago(n.created_at)}</span>
        </li>
      ))}
    </ul>
  );
}
