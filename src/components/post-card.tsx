import Link from "next/link";
import type { FeedPost } from "@/lib/queries";
import { ago, compact, duration, thumbnail } from "@/lib/format";
import { Avatar } from "./avatar";

export function PostCard({ post }: { post: FeedPost }) {
  const a = post.author;
  const thumb = thumbnail(post.video?.mux_playback_id ?? null, post.video?.thumbnail_time_s ?? 0);
  return (
    <article className="flex gap-3 border-b border-neutral-200 px-4 py-3">
      <Link href={a ? `/u/${a.handle}` : "#"} className="shrink-0"><Avatar profile={a} size={40} /></Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm">
          <Link href={a ? `/u/${a.handle}` : "#"} className="truncate font-semibold">{a?.display_name}</Link>
          {a?.is_verified && <span aria-label="Verified" className="text-blue-600">✔</span>}
          <span className="truncate text-neutral-500">@{a?.handle} · {ago(post.created_at)}</span>
        </div>
        {post.body && <p className="mt-1 whitespace-pre-wrap break-words">{post.body}</p>}
        {post.video && (
          <Link href={`/v/${post.video.id}`} className="relative mt-2 block overflow-hidden rounded-2xl bg-neutral-900">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt={post.video.title} className="aspect-video w-full object-cover" loading="lazy" />
            ) : (
              <div className="aspect-video w-full" />
            )}
            <span className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-2xl text-white">▶</span>
            {post.video.duration_s && (
              <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 text-xs text-white">{duration(post.video.duration_s)}</span>
            )}
          </Link>
        )}
        <div className="mt-2 flex justify-between pr-6 text-sm text-neutral-500">
          <span>💬 {compact(post.comment_count)}</span>
          <span>🔁 {compact(post.repost_count)}</span>
          <span>♡ {compact(post.like_count)}</span>
        </div>
      </div>
    </article>
  );
}
