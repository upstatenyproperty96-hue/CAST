import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getFeed } from "@/lib/queries";
import { PostCard } from "@/components/post-card";
import { BottomNav } from "@/components/bottom-nav";

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
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("slug, name").order("sort_order");
  if (slug) {
    const posts = await getFeed(supabase, "topic", { topicSlug: slug });
    const name = topics?.find((t) => t.slug === slug)?.name ?? "Topic";
    return (
      <>
        <Link href="/topics" className="px-4 text-sm text-blue-600">← All topics</Link>
        <h2 className="px-4 pt-2 text-lg font-semibold">{name}</h2>
        {posts.length ? posts.map((p) => <PostCard key={p.id} post={p} />) : <p className="p-6 text-neutral-500">No videos yet.</p>}
      </>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 px-4">
      {topics?.map((t) => (
        <Link key={t.slug} href={`/topics?t=${t.slug}`}
          className="flex aspect-[4/3] items-end rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 p-3 text-lg font-semibold text-white">
          {t.name}
        </Link>
      ))}
    </div>
  );
}
