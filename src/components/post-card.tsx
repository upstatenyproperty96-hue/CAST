import Link from "next/link";
import { BadgeCheck, Play, Repeat2, Scissors } from "lucide-react";
import type { FeedPost, QuotedPost } from "@/lib/queries";
import { ago, duration, thumbnail } from "@/lib/format";
import { Avatar } from "./avatar";
import { PostActions } from "./client/post-actions";

type Author = FeedPost["author"];

function Byline({ a, at, small = false }: { a: Author; at: string; small?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-1 ${small ? "text-sm" : "text-[15px]"}`}>
      <Link href={a ? `/u/${a.handle}` : "#"} className="truncate font-bold text-neutral-950 hover:underline">{a?.display_name}</Link>
      {a?.is_verified && <BadgeCheck size={small ? 15 : 17} className="shrink-0 fill-blue-600 text-canvas" aria-label="Verified" />}
      <span className="truncate text-neutral-500">@{a?.handle}</span>
      <span className="text-neutral-500">·</span>
      <span className="shrink-0 text-neutral-500">{ago(at)}</span>
    </div>
  );
}

function VideoTile({ video, compact = false }: { video: NonNullable<FeedPost["video"]>; compact?: boolean }) {
  const thumb = thumbnail(video.mux_playback_id, video.thumbnail_time_s);
  const portrait = video.aspect === "portrait" && !compact;
  return (
    <Link href={`/v/${video.id}`}
      className={`group relative block overflow-hidden bg-black ${compact ? "rounded-xl" : "mt-3 rounded-2xl border border-neutral-200"} ${portrait ? "max-w-[18rem]" : ""}`}>
      {thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt={video.title} loading="lazy"
          className={`w-full object-cover transition duration-500 group-hover:scale-[1.02] ${portrait ? "aspect-[9/14]" : "aspect-video"}`} />
      ) : (
        <div className={`w-full bg-gradient-to-br from-neutral-100 to-black ${portrait ? "aspect-[9/14]" : "aspect-video"}`} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      {!compact && (
        <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-md transition group-hover:scale-110 group-hover:bg-white/25">
          <Play size={26} fill="currentColor" className="ml-1" />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
        {!compact && video.title ? <span className="line-clamp-1 text-sm font-semibold text-white drop-shadow">{video.title}</span> : <span />}
        <span className="flex shrink-0 items-center gap-1.5">
          {video.source_video_id && (
            <span className="flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
              <Scissors size={11} />Clip
            </span>
          )}
          {video.duration_s ? (
            <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur">{duration(video.duration_s)}</span>
          ) : null}
        </span>
      </div>
    </Link>
  );
}

export function QuotedPreview({ q }: { q: QuotedPost }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200 transition hover:bg-neutral-50">
      <div className="flex items-center gap-2 px-3 pt-3">
        <Avatar profile={q.author} size={20} />
        <Byline a={q.author} at={q.created_at} small />
      </div>
      {q.body && <p className="whitespace-pre-wrap break-words px-3 pt-1 text-[15px] text-neutral-900">{q.body}</p>}
      {q.video && (
        <div className="flex gap-3 p-3">
          <div className="w-32 shrink-0"><VideoTile video={q.video} compact /></div>
          <Link href={`/v/${q.video.id}`} className="line-clamp-3 text-sm font-semibold text-neutral-900">{q.video.title}</Link>
        </div>
      )}
      {!q.video && <div className="h-3" />}
    </div>
  );
}

export function PostCard({ post, signedIn = false }: { post: FeedPost; signedIn?: boolean }) {
  const a = post.author;
  const href = post.video ? `/v/${post.video.id}` : `/post/${post.id}`;
  return (
    <article className="border-b border-neutral-200 px-4 pb-1 pt-3 transition hover:bg-neutral-50/60">
      {post.reposted_by && (
        <Link href={`/u/${post.reposted_by.handle}`} className="mb-1 ml-8 flex items-center gap-2 text-[13px] font-semibold text-neutral-500 hover:underline">
          <Repeat2 size={15} />{post.reposted_by.display_name} reposted
        </Link>
      )}
      <div className="flex gap-3">
        <Link href={a ? `/u/${a.handle}` : "#"} className="shrink-0"><Avatar profile={a} size={42} /></Link>
        <div className="min-w-0 flex-1">
          <Byline a={a} at={post.created_at} />
          {post.body && (
            <Link href={`/post/${post.id}`} className="mt-0.5 block whitespace-pre-wrap break-words text-[15px] leading-relaxed text-neutral-900">
              {post.body}
            </Link>
          )}
          {post.video && <VideoTile video={post.video} />}
          {post.quoted && <QuotedPreview q={post.quoted} />}
          <PostActions
            postId={post.id}
            commentHref={post.video ? `/v/${post.video.id}#comments` : `/post/${post.id}#comments`}
            sharePath={href}
            shareTitle={post.video?.title || post.body.slice(0, 80) || "Cast"}
            comments={post.comment_count} likes={post.like_count} reposts={post.repost_count}
            liked={!!post.liked} reposted={!!post.reposted} signedIn={signedIn}
          />
        </div>
      </div>
    </article>
  );
}
