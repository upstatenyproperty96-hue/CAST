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
