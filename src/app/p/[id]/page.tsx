import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { compact, duration, thumbnail } from "@/lib/format";
import { BottomNav } from "@/components/bottom-nav";
import { removeFromPlaylist } from "@/app/actions/social";

export default function PlaylistPage(props: PageProps<"/p/[id]">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><Inner {...props} /></Suspense>
      <BottomNav />
    </div>
  );
}

async function Inner({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await getUser();
  const { data: pl } = await supabase.from("playlists")
    .select("id, title, description, owner_id, owner:profiles!playlists_owner_id_fkey(handle, display_name)").eq("id", id).maybeSingle();
  if (!pl) notFound();
  const owner = pl.owner as unknown as { handle: string; display_name: string };
  const { data: items } = await supabase.from("playlist_items")
    .select("position, video:videos(id, title, duration_s, mux_playback_id, thumbnail_time_s, view_count)")
    .eq("playlist_id", id).order("position");
  type V = { id: string; title: string; duration_s: number | null; mux_playback_id: string | null; thumbnail_time_s: number; view_count: number };
  const videos = (items ?? []).flatMap((i) => { const v = (i as unknown as { video: V | null }).video; return v ? [v] : []; });
  const mine = user?.id === pl.owner_id;

  return (
    <>
      <div className="px-4 py-4">
        <h1 className="text-xl font-bold">{pl.title}</h1>
        <p className="text-sm text-neutral-500">Playlist by <Link href={`/u/${owner.handle}`} className="text-blue-600">{owner.display_name}</Link> · {videos.length} videos</p>
        {pl.description && <p className="mt-2">{pl.description}</p>}
      </div>
      <ul>
        {videos.map((v) => {
          const t = thumbnail(v.mux_playback_id, v.thumbnail_time_s);
          return (
            <li key={v.id} className="flex items-center gap-3 px-4 py-2">
              <Link href={`/v/${v.id}`} className="flex flex-1 gap-3">
                <div className="relative w-36 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t && <img src={t} alt="" className="aspect-video w-full object-cover" loading="lazy" />}
                  {v.duration_s && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-xs text-white">{duration(v.duration_s)}</span>}
                </div>
                <div className="min-w-0"><p className="line-clamp-2 font-medium">{v.title}</p><p className="text-sm text-neutral-500">{compact(v.view_count)} views</p></div>
              </Link>
              {mine && (
                <form action={removeFromPlaylist}>
                  <input type="hidden" name="playlistId" value={pl.id} />
                  <input type="hidden" name="videoId" value={v.id} />
                  <button className="text-sm text-red-600">Remove</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
