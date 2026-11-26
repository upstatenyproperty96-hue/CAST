"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

// All writes run as the signed-in user, so Row Level Security enforces ownership.
const id = z.uuid();

export async function toggleFollow(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const target = id.parse(formData.get("profileId"));
  const following = formData.get("following") === "1";
  if (following) {
    await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", target);
  } else {
    await supabase.from("follows").insert({ follower_id: user.id, followee_id: target });
  }
  revalidatePath("/u/[handle]", "page");
}

export async function toggleReaction(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const postId = id.parse(formData.get("postId"));
  const kind = z.enum(["like", "repost"]).parse(formData.get("kind"));
  const active = formData.get("active") === "1";
  if (active) {
    await supabase.from("reactions").delete().match({ user_id: user.id, post_id: postId, kind });
  } else {
    await supabase.from("reactions").insert({ user_id: user.id, post_id: postId, kind });
  }
  revalidatePath("/v/[id]", "page");
  revalidatePath("/post/[id]", "page");
  revalidatePath("/");
}

const quoteSchema = z.object({ postId: z.uuid(), body: z.string().trim().min(1, "Say something about it.").max(1000) });

// A quote post: your words on top of someone else's post. Row Level Security checks you can see it.
export async function quotePost(_: { error?: string } | undefined, formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const parsed = quoteSchema.safeParse({ postId: formData.get("postId"), body: formData.get("body") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your post." };
  const { data, error } = await supabase.from("posts")
    .insert({ author_id: user.id, body: parsed.data.body, repost_of_id: parsed.data.postId }).select("id").single();
  if (error || !data) return { error: "Couldn't post that. Try again." };
  revalidatePath("/");
  redirect(`/post/${data.id}`);
}

export async function deletePost(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("posts").delete().eq("id", id.parse(formData.get("postId"))).eq("author_id", user.id);
  revalidatePath("/");
  redirect("/");
}

const commentSchema = z.object({
  postId: z.uuid(),
  parentId: z.uuid().nullable(),
  body: z.string().trim().min(1).max(1000),
});

export async function addComment(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const parsed = commentSchema.safeParse({
    postId: formData.get("postId"),
    parentId: formData.get("parentId") || null,
    body: formData.get("body"),
  });
  if (!parsed.success) return;
  await supabase.from("comments").insert({
    post_id: parsed.data.postId, parent_id: parsed.data.parentId, body: parsed.data.body, author_id: user.id,
  });
  revalidatePath("/v/[id]", "page");
  revalidatePath("/post/[id]", "page");
}

export async function deleteComment(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("comments").delete().eq("id", id.parse(formData.get("commentId")));
  revalidatePath("/v/[id]", "page");
  revalidatePath("/post/[id]", "page");
}

const reportSchema = z.object({
  target: z.enum(["post", "user", "comment"]),
  targetId: z.uuid(),
  reason: z.string().trim().min(1).max(500),
});

export async function report(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false };
  const parsed = reportSchema.safeParse({ target: formData.get("target"), targetId: formData.get("targetId"), reason: formData.get("reason") });
  if (!parsed.success) return { ok: false };
  const { target, targetId, reason } = parsed.data;
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id, reason,
    post_id: target === "post" ? targetId : null,
    user_id: target === "user" ? targetId : null,
    comment_id: target === "comment" ? targetId : null,
  });
  return { ok: !error };
}

export async function toggleBlock(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const target = id.parse(formData.get("profileId"));
  if (formData.get("blocked") === "1") {
    await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target);
  } else {
    await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: target });
    // Blocking also removes the follow in both directions where we can.
    await supabase.from("follows").delete().eq("follower_id", user.id).eq("followee_id", target);
  }
  revalidatePath("/u/[handle]", "page");
}

export async function markNotificationsRead() {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/notifications");
}

const playlistSchema = z.object({ title: z.string().trim().min(1).max(100), videoId: z.uuid().nullable() });

export async function createPlaylist(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const parsed = playlistSchema.safeParse({ title: formData.get("title"), videoId: formData.get("videoId") || null });
  if (!parsed.success) return;
  const { data: pl } = await supabase.from("playlists").insert({ owner_id: user.id, title: parsed.data.title }).select("id").single();
  if (pl && parsed.data.videoId) {
    await supabase.from("playlist_items").insert({ playlist_id: pl.id, video_id: parsed.data.videoId, position: 1 });
  }
  revalidatePath("/v/[id]", "page");
}

export async function addToPlaylist(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const playlistId = id.parse(formData.get("playlistId"));
  const videoId = id.parse(formData.get("videoId"));
  const { count } = await supabase.from("playlist_items").select("video_id", { count: "exact", head: true }).eq("playlist_id", playlistId);
  await supabase.from("playlist_items").insert({ playlist_id: playlistId, video_id: videoId, position: (count ?? 0) + 1 });
  revalidatePath("/v/[id]", "page");
}

export async function removeFromPlaylist(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("playlist_items").delete()
    .eq("playlist_id", id.parse(formData.get("playlistId"))).eq("video_id", id.parse(formData.get("videoId")));
  revalidatePath("/p/[id]", "page");
}
