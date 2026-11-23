import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { compact } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { BottomNav } from "@/components/bottom-nav";

export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-20 pt-4">
      <Suspense fallback={null}><Results searchParams={searchParams} /></Suspense>
      <BottomNav />
    </div>
  );
}

// Escapes characters that have special meaning in a LIKE pattern or PostgREST filter.
const clean = (q: string) => q.replace(/[%_\\,()."']/g, " ").trim().slice(0, 60);

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const raw = typeof sp.q === "string" ? sp.q : "";
  const q = clean(raw);
  const form = (
    <form className="mb-4">
      <input name="q" defaultValue={raw} placeholder="Search creators, topics, and videos" autoFocus
        className="w-full rounded-full border border-neutral-300 px-4 py-3" />
    </form>
  );
  if (q.length < 2) return form;

  const supabase = await createClient();
  const pattern = `%${q}%`;
  const [{ data: people }, { data: videos }, { data: topics }] = await Promise.all([
    supabase.from("profiles").select("handle, display_name, avatar_url, follower_count")
      .or(`handle.ilike.${pattern},display_name.ilike.${pattern}`).order("follower_count", { ascending: false }).limit(10),
    supabase.from("videos").select("id, title, view_count").eq("status", "ready").ilike("title", pattern)
      .order("view_count", { ascending: false }).limit(20),
    supabase.from("topics").select("slug, name").ilike("name", pattern).limit(5),
  ]);

  return (
    <>
      {form}
      {!!topics?.length && (
        <div className="mb-4 flex flex-wrap gap-2">
          {topics.map((t) => <Link key={t.slug} href={`/topics?t=${t.slug}`} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700">{t.name}</Link>)}
        </div>
      )}
      {!!people?.length && (
        <section className="mb-4">
          <h2 className="mb-2 font-semibold">People</h2>
          <ul className="flex flex-col gap-2">
            {people.map((p) => (
              <li key={p.handle}><Link href={`/u/${p.handle}`} className="flex items-center gap-3">
                <Avatar profile={p} size={40} />
                <span><span className="font-medium">{p.display_name}</span> <span className="text-neutral-500">@{p.handle} · {compact(p.follower_count)} followers</span></span>
              </Link></li>
            ))}
          </ul>
        </section>
      )}
      {!!videos?.length && (
        <section>
          <h2 className="mb-2 font-semibold">Videos</h2>
          <ul className="flex flex-col gap-2">
            {videos.map((v) => <li key={v.id}><Link href={`/v/${v.id}`}>{v.title} <span className="text-sm text-neutral-500">· {compact(v.view_count)} views</span></Link></li>)}
          </ul>
        </section>
      )}
      {!people?.length && !videos?.length && !topics?.length && <p className="text-neutral-500">No results for “{raw}”.</p>}
    </>
  );
}
