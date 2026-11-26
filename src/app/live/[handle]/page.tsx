import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";
import { LivePlayer } from "@/components/client/live-player";
import { AutoRefresh } from "@/components/client/message-composer";

export default function LiveWatchPage({ params }: PageProps<"/live/[handle]">) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-3xl">
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><Watch params={params} /></Suspense>
    </div>
  );
}

async function Watch({ params }: { params: PageProps<"/live/[handle]">["params"] }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("id, handle, display_name, avatar_url").eq("handle", handle.toLowerCase()).maybeSingle();
  if (!profile) notFound();
  const { data: stream } = await supabase.from("live_streams").select("title, status, mux_playback_id, started_at").eq("creator_id", profile.id).maybeSingle();
  const live = stream?.status === "active";
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href="/" aria-label="Home">←</Link>
        <Link href={`/u/${profile.handle}`} className="flex items-center gap-2">
          <Avatar profile={profile} size={36} />
          <span className="font-semibold">{profile.display_name}</span>
        </Link>
        {live && <span className="ml-auto rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">LIVE</span>}
      </div>
      {live && stream ? (
        <>
          <LivePlayer playbackId={stream.mux_playback_id} title={stream.title || `${profile.display_name} is live`} />
          <h1 className="px-4 py-3 text-lg font-semibold">{stream.title || `${profile.display_name} is live`}</h1>
        </>
      ) : (
        <div className="p-10 text-center text-neutral-500">
          <p>{profile.display_name} isn&apos;t live right now.</p>
          <Link href={`/u/${profile.handle}`} className="mt-2 inline-block text-blue-600">See their videos</Link>
          <AutoRefresh seconds={20} />
        </div>
      )}
    </>
  );
}
