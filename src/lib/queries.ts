import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type FeedPost = {
  id: string;
  body: string;
  created_at: string;
  like_count: number;
  repost_count: number;
  comment_count: number;
  author: { handle: string; display_name: string; avatar_url: string | null; is_verified: boolean } | null;
  video: {
    id: string; title: string; duration_s: number | null; aspect: string | null;
    mux_playback_id: string | null; thumbnail_time_s: number; source_video_id: string | null;
  } | null;
};

const POST_FIELDS =
  "id, body, created_at, like_count, repost_count, comment_count, " +
  "author:profiles!posts_author_id_fkey(handle, display_name, avatar_url, is_verified), " +
  "video:videos(id, title, duration_s, aspect, mux_playback_id, thumbnail_time_s, source_video_id)";

export type FeedKind = "for-you" | "following" | "topic";

// Row Level Security already removes posts the viewer may not see.
export async function getFeed(
  supabase: SupabaseClient, kind: FeedKind, opts: { userId?: string; topicSlug?: string } = {},
): Promise<FeedPost[]> {
  let query = supabase.from("posts").select(POST_FIELDS).order("created_at", { ascending: false }).limit(30);

  if (kind === "following") {
    if (!opts.userId) return [];
    const { data: follows } = await supabase.from("follows").select("followee_id").eq("follower_id", opts.userId);
    const ids = (follows ?? []).map((f) => f.followee_id);
    if (!ids.length) return [];
    query = query.in("author_id", ids);
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
