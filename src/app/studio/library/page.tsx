import { Suspense } from "react";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { compact, duration } from "@/lib/format";
import { StudioNav } from "@/components/studio-nav";
import { ShareButton } from "@/components/client/share-button";

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <StudioNav active="/studio/library" />
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}><List /></Suspense>
    </div>
  );
}

// Mux serves the clip's MP4 copy; ?download= makes the browser save it with a readable name.
function downloadUrl(playbackId: string, title: string | null) {
  const name = (title || "cast-clip").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "cast-clip";
  return `https://stream.mux.com/${encodeURIComponent(playbackId)}/highest.mp4?download=${encodeURIComponent(name)}`;
}

const statusLabel: Record<string, string> = { uploading: "Uploading", processing: "Processing", ready: "Live", failed: "Failed" };

async function List() {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data } = await supabase.from("videos")
    .select("id, title, status, duration_s, view_count, visibility, created_at, source_video_id, mux_playback_id")
    .eq("creator_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (!data?.length) return <p className="text-neutral-500">No videos yet.</p>;
  return (
    <ul className="divide-y divide-neutral-200">
      {data.map((v) => (
        <li key={v.id} className="flex items-center justify-between py-3">
          <Link href={`/v/${v.id}`} className="min-w-0">
            <p className="truncate font-medium">{v.title || "Untitled"}</p>
            <p className="text-sm text-neutral-500">{duration(v.duration_s)} · {compact(v.view_count)} views · {v.visibility}</p>
          </Link>
          <div className="flex items-center gap-3">
          {v.status === "ready" && !v.source_video_id && <Link href={`/studio/clip/${v.id}`} className="text-sm text-blue-600">Clip</Link>}
          {v.status === "ready" && v.source_video_id && v.mux_playback_id && (
            <a href={downloadUrl(v.mux_playback_id, v.title)} className="text-sm text-blue-600" title="The file is ready a minute or two after the clip goes live.">Download</a>
          )}
          {v.status === "ready" && v.visibility !== "followers" && <ShareButton path={`/v/${v.id}`} title={v.title || "Cast video"} />}
          <span className={`rounded-full px-2 py-0.5 text-xs ${v.status === "ready" ? "bg-green-100 text-green-800" : v.status === "failed" ? "bg-red-100 text-red-800" : "bg-neutral-100"}`}>
            {statusLabel[v.status]}
          </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
