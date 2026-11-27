import { Suspense } from "react";
import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { getFeed, type FeedKind } from "@/lib/queries";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";
import { Logo } from "@/components/logo";
import { Mail } from "lucide-react";

const tabs: { key: FeedKind; label: string; href: string }[] = [
  { key: "for-you", label: "For You", href: "/" },
  { key: "following", label: "Following", href: "/?feed=following" },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-canvas/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 pt-3 lg:hidden">
          <Logo className="!text-2xl" />
          <Suspense fallback={null}><MessagesLink /></Suspense>
        </div>
        <Suspense fallback={<div className="h-12" />}>
          <FeedTabs searchParams={searchParams} />
        </Suspense>
      </header>
      <Suspense fallback={null}><LiveNow /></Suspense>
      <Suspense fallback={<p className="p-6 text-center text-neutral-500">Loading…</p>}>
        <Feed searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}><Nav /></Suspense>
    </div>
  );
}

async function current(searchParams: PageProps<"/">["searchParams"]) {
  const sp = await searchParams;
  const feed = sp.feed === "following" ? "following" : "for-you";
  return feed as FeedKind;
}

async function FeedTabs({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const active = await current(searchParams);
  return (
    <div className="flex">
      {[...tabs, { key: "topics", label: "Topics", href: "/topics" }].map((t) => {
        const on = active === t.key;
        return (
          <Link key={t.key} href={t.href}
            className={`flex flex-1 justify-center pt-3 text-[15px] transition hover:bg-neutral-100/60 ${on ? "font-bold text-neutral-950" : "font-medium text-neutral-500"}`}>
            <span className="relative pb-3">
              {t.label}
              {on && <span className="bg-brand absolute inset-x-0 bottom-0 h-1 rounded-full" />}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

async function Feed({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const kind = await current(searchParams);
  const { supabase, user } = await getUser();
  if (kind === "following" && !user) {
    return <p className="p-6 text-center"><Link className="text-blue-600" href="/login">Sign in</Link> to see people you follow.</p>;
  }
  const posts = await getFeed(supabase, kind, { userId: user?.id });
  if (!posts.length) {
    return (
      <div className="px-8 py-16 text-center">
        <p className="text-2xl font-extrabold text-neutral-950">{kind === "following" ? "Your Following feed is empty" : "Nothing here yet"}</p>
        <p className="mt-2 text-neutral-500">{kind === "following" ? "Follow creators and their videos and reposts will show up here." : "Be the first to post a video."}</p>
        <Link href={kind === "following" ? "/search" : "/studio"} className="bg-brand mt-6 inline-block rounded-full px-6 py-3 font-bold text-white">
          {kind === "following" ? "Find creators" : "Post a video"}
        </Link>
      </div>
    );
  }
  return <>{posts.map((p) => <PostCard key={p.key ?? p.id} post={p} signedIn={!!user} />)}</>;
}

// Creators streaming right now, newest first.
async function LiveNow() {
  const supabase = await createClient();
  const { data } = await supabase.from("live_streams")
    .select("title, creator:profiles!live_streams_creator_id_fkey(handle, display_name, avatar_url)")
    .eq("status", "active").order("started_at", { ascending: false }).limit(12);
  type Row = { title: string; creator: { handle: string; display_name: string; avatar_url: string | null } };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return null;
  return (
    <div className="no-scrollbar flex gap-4 overflow-x-auto border-b border-neutral-200 px-4 py-3">
      {rows.map((r) => (
        <Link key={r.creator.handle} href={`/live/${r.creator.handle}`} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs">
          <span className="rounded-full bg-gradient-to-tr from-red-600 to-pink-500 p-[3px]"><span className="block rounded-full bg-canvas p-[2px]"><Avatar profile={r.creator} size={52} /></span></span>
          <span className="-mt-3 rounded-md bg-red-600 px-1.5 text-[10px] font-extrabold tracking-wide text-white ring-2 ring-canvas">LIVE</span>
          <span className="w-full truncate text-center text-neutral-700">{r.creator.display_name}</span>
        </Link>
      ))}
    </div>
  );
}

async function MessagesLink() {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data: unread } = await supabase.rpc("unread_conversations");
  return (
    <Link href="/messages" aria-label={unread ? `Messages, ${unread} unread` : "Messages"} className="relative rounded-full p-2 text-neutral-900 hover:bg-neutral-100">
      <Mail size={22} />
      {!!unread && <span className="absolute -right-0.5 top-0 min-w-5 rounded-full bg-pink-500 px-1.5 text-center text-[11px] font-bold leading-5 text-white ring-2 ring-canvas">{unread}</span>}
    </Link>
  );
}

async function Nav() {
  const { supabase, user } = await getUser();
  const handle = user
    ? (await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle()).data?.handle
    : null;
  return <BottomNav handle={handle} />;
}
