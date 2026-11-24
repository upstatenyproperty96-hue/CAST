"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  handle: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, "Handles use 3 to 30 letters, numbers, or underscores."),
  bio: z.string().trim().max(300),
  website: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(200)]),
  likesPublic: z.boolean(),
});

export type ProfileState = { error?: string; saved?: boolean };

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sign in again." };
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    handle: formData.get("handle"),
    bio: formData.get("bio") ?? "",
    website: formData.get("website") ?? "",
    likesPublic: formData.get("likesPublic") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  const d = parsed.data;
  const { error } = await supabase.from("profiles").update({
    display_name: d.displayName, handle: d.handle, bio: d.bio, website_url: d.website || null, likes_public: d.likesPublic,
  }).eq("id", user.id);
  if (error) return { error: error.code === "23505" ? "That handle is taken." : "Couldn't save. Try again." };
  revalidatePath("/u/[handle]", "page");
  return { saved: true };
}

// The image itself is uploaded from the browser into the user's own storage folder;
// here we only accept a URL that points inside that folder.
export async function setProfileImage(kind: "avatar" | "banner", url: string) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const prefix = `${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${user.id}/`;
  if (!url.startsWith(prefix) || !/^[\w\-./:%]+(\?v=\d+)?$/.test(url)) return;
  await supabase.from("profiles").update(kind === "avatar" ? { avatar_url: url } : { banner_url: url }).eq("id", user.id);
  revalidatePath("/u/[handle]", "page");
}

const topicsSchema = z.array(z.coerce.number().int().positive()).min(1).max(20);

export async function saveTopics(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const parsed = topicsSchema.safeParse(formData.getAll("topic"));
  if (!parsed.success) redirect("/onboarding?error=1");
  await supabase.from("user_topics").delete().eq("user_id", user.id);
  await supabase.from("user_topics").insert(parsed.data.map((topic_id) => ({ user_id: user.id, topic_id })));
  await supabase.from("profiles").update({ onboarded: true }).eq("id", user.id);
  redirect("/");
}
