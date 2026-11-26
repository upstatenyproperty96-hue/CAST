import { Suspense } from "react";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getFeed, type FeedKind } from "@/lib/queries";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";
import { Logo } from "@/components/logo";

const tabs: { key: FeedKind; label: string; href: string }[] = [
  { key: "for-you", label: "For You", href: "/" },
  { key: "following", label: "Following", href: "/?feed=following" },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 pt-3">
          <Logo className="!text-2xl" />
          <Suspense fallback={null}><MessagesLink /></Suspense>
        </div>
        <Suspense fallback={<div className="h-12" />}>
          <FeedTabs searchParams={searchParams} />
        </Suspense>
      </header>
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
    <div className="flex gap-2 px-4 py-2">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${active === t.key ? "bg-blue-600 text-white" : "bg-neutral-100 text-neutral-700"}`}>
          {t.label}
        </Link>
      ))}
      <Link href="/topics" className="rounded-full bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-700">Topics</Link>
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
  if (!posts.length) return <p className="p-6 text-center text-neutral-500">Nothing here yet. Be the first to post.</p>;
  return <>{posts.map((p) => <PostCard key={p.id} post={p} />)}</>;
}

async function MessagesLink() {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data: unread } = await supabase.rpc("unread_conversations");
  return (
    <Link href="/messages" aria-label={unread ? `Messages, ${unread} unread` : "Messages"} className="relative text-2xl">
      ✉
      {!!unread && <span className="absolute -right-2 -top-1 rounded-full bg-pink-500 px-1.5 text-xs font-semibold text-white">{unread}</span>}
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
