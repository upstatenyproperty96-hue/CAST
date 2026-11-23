"use server";
import { revalidatePath } from "next/cache";
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
}

export async function deleteComment(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  await supabase.from("comments").delete().eq("id", id.parse(formData.get("commentId")));
  revalidatePath("/v/[id]", "page");
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
