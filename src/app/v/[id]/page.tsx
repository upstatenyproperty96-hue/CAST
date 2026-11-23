import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { compact } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { Player } from "@/components/client/player";
import { toggleReaction } from "@/app/actions/social";
import { Comments } from "@/components/comments";
import { ReportButton } from "@/components/client/report-button";

export default function VideoPage(props: PageProps<"/v/[id]">) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <Suspense fallback={<p className="p-6 text-neutral-400">Loading…</p>}>
        <Video {...props} />
      </Suspense>
    </div>
  );
}

async function Video({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await getUser();
  const { data: video } = await supabase
    .from("videos")
    .select("id, title, description, status, aspect, mux_playback_id, source_video_id, creator:profiles!videos_creator_id_fkey(handle, display_name, avatar_url, is_verified)")
    .eq("id", id)
    .maybeSingle();
  if (!video) notFound();
  const creator = video.creator as unknown as { handle: string; display_name: string; avatar_url: string | null; is_verified: boolean };

  const { data: post } = await supabase.from("posts").select("id, author_id, like_count, repost_count, comment_count").eq("video_id", id).limit(1).maybeSingle();
  const mine = user && post
    ? (await supabase.from("reactions").select("kind").eq("post_id", post.id).eq("user_id", user.id)).data?.map((r) => r.kind) ?? []
    : [];

  return (
    <>
    <div className="relative mx-auto flex min-h-dvh max-w-xl items-center justify-center">
      <Link href="/" className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1 text-sm">← Back</Link>
      {video.status === "ready" && video.mux_playback_id ? (
        <Player videoId={video.id} playbackId={video.mux_playback_id} title={video.title} portrait={video.aspect === "portrait"} />
      ) : (
        <p className="text-neutral-400">{video.status === "failed" ? "This video couldn't be processed." : "Processing… check back in a minute."}</p>
      )}

      {post && (
        <div className="absolute bottom-28 right-3 z-10 flex flex-col items-center gap-4 text-sm">
          {(["like", "repost"] as const).map((kind) => {
            const active = mine.includes(kind);
            const count = kind === "like" ? post.like_count : post.repost_count;
            return user ? (
              <form key={kind} action={toggleReaction} className="flex flex-col items-center">
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="active" value={active ? "1" : "0"} />
                <button aria-label={kind} className={`text-2xl ${active ? "text-pink-500" : ""}`}>{kind === "like" ? "♥" : "🔁"}</button>
                {compact(count)}
              </form>
            ) : (
              <Link key={kind} href="/login" className="flex flex-col items-center"><span className="text-2xl">{kind === "like" ? "♥" : "🔁"}</span>{compact(count)}</Link>
            );
          })}
          <span className="flex flex-col items-center"><span className="text-2xl">💬</span>{compact(post.comment_count)}</span>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pb-8">
        <Link href={`/u/${creator.handle}`} className="flex items-center gap-2">
          <Avatar profile={creator} size={36} />
          <span className="font-semibold">{creator.display_name}</span>
          {creator.is_verified && <span className="text-blue-400">✔</span>}
        </Link>
        <p className="mt-2">{video.title}</p>
        {video.source_video_id && (
          <Link href={`/v/${video.source_video_id}`} className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black">
            Watch full video
          </Link>
        )}
        {post && user && user.id !== post.author_id && <ReportButton target="post" targetId={post.id} className="ml-3 text-xs text-neutral-300" />}
      </div>
    </div>
    {post && <Comments postId={post.id} postAuthorId={post.author_id} />}
    </>
  );
}
