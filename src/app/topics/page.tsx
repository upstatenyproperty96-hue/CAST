import { Suspense } from "react";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getFeed } from "@/lib/queries";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";

const TILE = [
  "from-blue-500 to-indigo-700", "from-pink-500 to-orange-400", "from-emerald-400 to-cyan-600",
  "from-violet-500 to-fuchsia-500", "from-amber-400 to-rose-500", "from-sky-400 to-blue-700",
];

export default function TopicsPage({ searchParams }: PageProps<"/topics">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <h1 className="px-4 py-3 text-xl font-bold">Topics</h1>
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
        <Topics searchParams={searchParams} />
      </Suspense>
      <BottomNav />
    </div>
  );
}

async function Topics({ searchParams }: { searchParams: PageProps<"/topics">["searchParams"] }) {
  const sp = await searchParams;
  const slug = typeof sp.t === "string" ? sp.t : null;
  const { supabase, user } = await getUser();
  const { data: topics } = await supabase.from("topics").select("slug, name").order("sort_order");
  if (slug) {
    const posts = await getFeed(supabase, "topic", { topicSlug: slug, userId: user?.id });
    const name = topics?.find((t) => t.slug === slug)?.name ?? "Topic";
    return (
      <>
        <Link href="/topics" className="px-4 text-sm text-blue-600">← All topics</Link>
        <h2 className="px-4 pt-2 text-lg font-semibold">{name}</h2>
        {posts.length ? posts.map((p) => <PostCard key={p.id} post={p} signedIn={!!user} />) : <p className="p-6 text-neutral-500">No videos yet.</p>}
      </>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      {topics?.map((t, i) => (
        <Link key={t.slug} href={`/topics?t=${t.slug}`}
          className={`flex aspect-[4/3] items-end rounded-2xl bg-gradient-to-br p-3 text-lg font-bold text-white shadow-lg transition hover:brightness-110 ${TILE[i % TILE.length]}`}>
          {t.name}
        </Link>
      ))}
    </div>
  );
}
