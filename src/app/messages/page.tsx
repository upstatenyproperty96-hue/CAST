import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { ago } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { BottomNav } from "@/components/bottom-nav";

export default function MessagesPage({ searchParams }: PageProps<"/messages">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <h1 className="px-4 py-3 text-xl font-bold">Messages</h1>
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><Inbox searchParams={searchParams} /></Suspense>
      <BottomNav />
    </div>
  );
}

type Person = { id: string; handle: string; display_name: string; avatar_url: string | null };
type Row = { id: string; last_message_at: string; a: Person; b: Person };

async function Inbox({ searchParams }: { searchParams: PageProps<"/messages">["searchParams"] }) {
  const { notice } = await searchParams;
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/messages");
  const [{ data }, { data: reads }] = await Promise.all([
    supabase.from("conversations")
      .select("id, last_message_at, a:profiles!conversations_user_a_fkey(id, handle, display_name, avatar_url), b:profiles!conversations_user_b_fkey(id, handle, display_name, avatar_url)")
      .order("last_message_at", { ascending: false }).limit(100),
    supabase.from("conversation_reads").select("conversation_id, last_read_at").eq("user_id", user.id),
  ]);
  const readAt = new Map((reads ?? []).map((r) => [r.conversation_id, r.last_read_at]));
  const rows = (data ?? []) as unknown as Row[];
  return (
    <>
      {notice === "follow" && (
        <p className="mx-4 mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          You can message people who follow you. Once they write back, you can keep talking.
        </p>
      )}
      {!rows.length ? (
        <p className="p-6 text-center text-neutral-500">No messages yet. Open the profile of someone who follows you and tap Message.</p>
      ) : (
        <ul>
          {rows.map((c) => {
            const other = c.a.id === user.id ? c.b : c.a;
            const unread = new Date(c.last_message_at) > new Date(readAt.get(c.id) ?? 0);
            return (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className={`flex items-center gap-3 border-b border-neutral-100 px-4 py-3 ${unread ? "bg-blue-50" : ""}`}>
                  <Avatar profile={other} size={40} />
                  <span className="flex-1">
                    <span className={unread ? "font-semibold" : ""}>{other.display_name}</span>
                    <span className="block text-sm text-neutral-500">@{other.handle}</span>
                  </span>
                  <span className="text-xs text-neutral-500">{ago(c.last_message_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
