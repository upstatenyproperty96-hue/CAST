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
import { SaveToPlaylist } from "@/components/save-to-playlist";
import { ReportButton } from "@/components/client/report-button";
import { ShareButton } from "@/components/client/share-button";
import { ArrowLeft, BadgeCheck, Heart, MessageCircle, PenLine, Repeat2, Share } from "lucide-react";

const rail = "flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur-md transition hover:bg-black/55";

export default function VideoPage(props: PageProps<"/v/[id]">) {
  return (
    <div className="min-h-dvh bg-black text-white">
      <Suspense fallback={<p className="p-6 text-white/60">Loading…</p>}>
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
    .select("id, title, description, status, aspect, visibility, mux_playback_id, source_video_id, creator:profiles!videos_creator_id_fkey(handle, display_name, avatar_url, is_verified)")
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
      <Link href="/" aria-label="Back" className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md hover:bg-black/60"><ArrowLeft size={20} /></Link>
      {video.status === "ready" && video.mux_playback_id ? (
        <Player videoId={video.id} playbackId={video.mux_playback_id} title={video.title} portrait={video.aspect === "portrait"} />
      ) : (
        <p className="text-white/60">{video.status === "failed" ? "This video couldn't be processed." : "Processing… check back in a minute."}</p>
      )}

      {post && (
        <div className="absolute bottom-32 right-3 z-10 flex flex-col items-center gap-5 text-xs font-semibold text-white">
          {(["like", "repost"] as const).map((kind) => {
            const active = mine.includes(kind);
            const count = kind === "like" ? post.like_count : post.repost_count;
            const Icon = kind === "like" ? Heart : Repeat2;
            const on = kind === "like" ? "text-pink-500" : "text-emerald-400";
            const face = (
              <span className={`${rail} ${active ? on : ""}`}>
                <Icon size={26} fill={active && kind === "like" ? "currentColor" : "none"} strokeWidth={active ? 2.6 : 2} />
              </span>
            );
            return user ? (
              <form key={kind} action={toggleReaction} className="flex flex-col items-center gap-1">
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="kind" value={kind} />
                <input type="hidden" name="active" value={active ? "1" : "0"} />
                <button aria-label={active ? `Undo ${kind}` : kind} aria-pressed={active}>{face}</button>
                {compact(count)}
              </form>
            ) : (
              <Link key={kind} href="/login" className="flex flex-col items-center gap-1">{face}{compact(count)}</Link>
            );
          })}
          <Link href="#comments" className="flex flex-col items-center gap-1" aria-label="Comments">
            <span className={rail}><MessageCircle size={26} /></span>{compact(post.comment_count)}
          </Link>
          {user && (
            <Link href={`/compose?quote=${post.id}`} className="flex flex-col items-center gap-1" aria-label="Quote">
              <span className={rail}><PenLine size={24} /></span>Quote
            </Link>
          )}
          {video.visibility !== "followers" && (
            <ShareButton path={`/v/${video.id}`} title={video.title || "Cast video"} className="flex flex-col items-center gap-1">
              <span className={rail}><Share size={24} /></span>
            </ShareButton>
          )}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-4 pb-8">
        <Link href={`/u/${creator.handle}`} className="flex items-center gap-2">
          <Avatar profile={creator} size={36} />
          <span className="font-semibold">{creator.display_name}</span>
          {creator.is_verified && <BadgeCheck size={17} className="fill-blue-600 text-black" aria-label="Verified" />}
        </Link>
        <p className="mt-2 max-w-[80%] text-[15px] font-semibold leading-snug">{video.title}</p>
        {video.source_video_id && (
          <Link href={`/v/${video.source_video_id}`} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black">
            Watch full video
          </Link>
        )}
        {post && user && user.id !== post.author_id && <ReportButton target="post" targetId={post.id} className="ml-3 text-xs text-white/60" />}
      </div>
    </div>
    {video.status === "ready" && <SaveToPlaylist videoId={video.id} />}
    {post && <Comments postId={post.id} postAuthorId={post.author_id} />}
    </>
  );
}
