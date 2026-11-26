import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { ago } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { MessageComposer, AutoRefresh, MarkRead } from "@/components/client/message-composer";

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><Conversation params={params} /></Suspense>
    </div>
  );
}

type Person = { id: string; handle: string; display_name: string; avatar_url: string | null };

async function Conversation({ params }: { params: PageProps<"/messages/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=/messages/${id}`);
  const { data: convo } = await supabase.from("conversations")
    .select("id, a:profiles!conversations_user_a_fkey(id, handle, display_name, avatar_url), b:profiles!conversations_user_b_fkey(id, handle, display_name, avatar_url)")
    .eq("id", id).maybeSingle();
  if (!convo) notFound();
  const { a, b } = convo as unknown as { a: Person; b: Person };
  const other = a.id === user.id ? b : a;
  const { data } = await supabase.from("messages").select("id, sender_id, body, created_at")
    .eq("conversation_id", id).order("created_at", { ascending: false }).limit(200);
  const messages = (data ?? []).reverse();

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white/90 px-4 py-3 backdrop-blur">
        <Link href="/messages" aria-label="Back to messages">←</Link>
        <Link href={`/u/${other.handle}`} className="flex items-center gap-2">
          <Avatar profile={other} size={32} />
          <span className="font-semibold">{other.display_name}</span>
        </Link>
      </header>
      <ol className="flex flex-1 flex-col gap-2 px-4 py-4">
        {messages.map((m) => {
          const mine = m.sender_id === user.id;
          return (
            <li key={m.id} className={`max-w-[80%] ${mine ? "self-end text-right" : "self-start"}`}>
              <p className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-left ${mine ? "bg-blue-600 text-white" : "bg-neutral-100"}`}>{m.body}</p>
              <span className="text-xs text-neutral-400">{ago(m.created_at)}</span>
            </li>
          );
        })}
        {!messages.length && <li className="text-center text-neutral-500">Say hello 👋</li>}
      </ol>
      <MessageComposer conversationId={id} />
      <AutoRefresh seconds={5} />
      <MarkRead conversationId={id} latest={messages.at(-1)?.created_at ?? null} />
    </>
  );
}
