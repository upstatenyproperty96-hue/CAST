import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type Author = { handle: string; display_name: string; avatar_url: string | null; is_verified: boolean } | null;
type Video = {
  id: string; title: string; duration_s: number | null; aspect: string | null;
  mux_playback_id: string | null; thumbnail_time_s: number; source_video_id: string | null;
} | null;

export type QuotedPost = { id: string; body: string; created_at: string; author: Author; video: Video };

export type FeedPost = {
  id: string;
  body: string;
  created_at: string;
  like_count: number;
  repost_count: number;
  comment_count: number;
  author: Author;
  video: Video;
  // The post this one quotes, if any. Filled in by finishPosts.
  repost_of_id?: string | null;
  quoted?: QuotedPost | null;
  // Set when it's in the feed because someone the viewer follows reposted it.
  reposted_by?: { handle: string; display_name: string } | null;
  // Set when the feed item is a repost, so a post reposted twice still has a unique key.
  key?: string;
  // The viewer's own reactions.
  liked?: boolean;
  reposted?: boolean;
};

const AUTHOR = "author:profiles!posts_author_id_fkey(handle, display_name, avatar_url, is_verified)";
const VIDEO = "video:videos(id, title, duration_s, aspect, mux_playback_id, thumbnail_time_s, source_video_id)";
export const POST_FIELDS = `id, body, created_at, like_count, repost_count, comment_count, repost_of_id, ${AUTHOR}, ${VIDEO}`;

export type FeedKind = "for-you" | "following" | "topic";

// Row Level Security already removes posts the viewer may not see.
export async function getFeed(
  supabase: SupabaseClient, kind: FeedKind, opts: { userId?: string; topicSlug?: string } = {},
): Promise<FeedPost[]> {
  return finishPosts(supabase, await loadFeed(supabase, kind, opts), opts.userId);
}

async function loadFeed(
  supabase: SupabaseClient, kind: FeedKind, opts: { userId?: string; topicSlug?: string },
): Promise<FeedPost[]> {
  let query = supabase.from("posts").select(POST_FIELDS).order("created_at", { ascending: false }).limit(30);

  if (kind === "following") {
    if (!opts.userId) return [];
    const { data: follows } = await supabase.from("follows").select("followee_id").eq("follower_id", opts.userId);
    const ids = (follows ?? []).map((f) => f.followee_id);
    if (!ids.length) return [];
    // Their own posts, plus what they reposted, newest first (like X).
    const [{ data: own }, { data: reposts }] = await Promise.all([
      query.in("author_id", ids),
      supabase.from("reactions")
        .select(`created_at, user:profiles!reactions_user_id_fkey(handle, display_name), post:posts(${POST_FIELDS})`)
        .eq("kind", "repost").in("user_id", ids).neq("user_id", opts.userId)
        .order("created_at", { ascending: false }).limit(30),
    ]);
    type R = { created_at: string; user: { handle: string; display_name: string }; post: FeedPost | null };
    const items: { at: string; post: FeedPost }[] = ((own ?? []) as unknown as FeedPost[]).map((p) => ({ at: p.created_at, post: p }));
    const shown = new Set(items.map((i) => i.post.id));
    for (const r of (reposts ?? []) as unknown as R[]) {
      if (!r.post || shown.has(r.post.id)) continue;
      shown.add(r.post.id);
      items.push({ at: r.created_at, post: { ...r.post, reposted_by: r.user, key: `r:${r.user.handle}:${r.post.id}` } });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map((i) => i.post);
  } else if (kind === "topic" && opts.topicSlug) {
    const { data: topic } = await supabase.from("topics").select("id").eq("slug", opts.topicSlug).maybeSingle();
    if (!topic) return [];
    const { data: vids } = await supabase.from("videos").select("id").eq("topic_id", topic.id).limit(200);
    const ids = (vids ?? []).map((v) => v.id);
    if (!ids.length) return [];
    query = query.in("video_id", ids);
  }
  if (kind === "for-you") {
    // Ranked in the database (see for_you_feed): engagement, your topics, people you follow, recency.
    const { data: ranked } = await supabase.rpc("for_you_feed", { p_limit: 30, p_offset: 0 });
    const ids = ((ranked ?? []) as { id: string }[]).map((r) => r.id);
    if (!ids.length) return [];
    const { data } = await supabase.from("posts").select(POST_FIELDS).in("id", ids);
    const byId = new Map(((data ?? []) as unknown as FeedPost[]).map((p) => [p.id, p]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }
  const { data } = await query;
  return (data ?? []) as unknown as FeedPost[];
}

// Adds what a list of posts needs before it is shown: the post each quote refers to, and
// (for a signed-in viewer) which posts they already liked or reposted.
// Quoted posts are loaded with a second query because posts point at posts, and the API
// can't tell which direction of that link an inline lookup means.
export async function finishPosts(supabase: SupabaseClient, posts: FeedPost[], userId?: string | null): Promise<FeedPost[]> {
  if (!posts.length) return posts;
  const quotedIds = [...new Set(posts.flatMap((p) => p.repost_of_id ?? []))];
  const [quoted, mine] = await Promise.all([
    quotedIds.length
      ? supabase.from("posts").select(`id, body, created_at, ${AUTHOR}, ${VIDEO}`).in("id", quotedIds)
      : Promise.resolve({ data: [] }),
    userId
      ? supabase.from("reactions").select("post_id, kind").eq("user_id", userId).in("post_id", [...new Set(posts.map((p) => p.id))])
      : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map(((quoted.data ?? []) as unknown as QuotedPost[]).map((q) => [q.id, q]));
  const reacted = new Set(((mine.data ?? []) as { post_id: string; kind: string }[]).map((r) => `${r.kind}:${r.post_id}`));
  return posts.map((p) => ({
    ...p,
    quoted: p.repost_of_id ? byId.get(p.repost_of_id) ?? null : null,
    liked: reacted.has(`like:${p.id}`),
    reposted: reacted.has(`repost:${p.id}`),
  }));
}
