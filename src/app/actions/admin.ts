"use server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileFlags } from "@/lib/access";

// Every admin action re-checks that the caller is an admin before using the service role.
async function requireAdmin() {
  const { supabase, user } = await getUser();
  if (!user || !(await profileFlags(supabase, user.id)).isAdmin) throw new Error("Not allowed");
  return { userId: user.id, admin: createAdminClient() };
}

const reportId = z.coerce.number().int().positive();

export async function dismissReport(formData: FormData) {
  const { admin } = await requireAdmin();
  await admin.from("reports").update({ status: "dismissed" }).eq("id", reportId.parse(formData.get("reportId")));
  revalidatePath("/admin");
}

export async function takeDown(formData: FormData) {
  const { admin } = await requireAdmin();
  const id = reportId.parse(formData.get("reportId"));
  const reason = z.string().trim().min(1).max(500).parse(formData.get("reason") || "Violates Cast rules");
  const { data: r } = await admin.from("reports").select("post_id, comment_id, user_id").eq("id", id).single();
  if (!r) return;
  if (r.comment_id) await admin.from("comments").delete().eq("id", r.comment_id);
  if (r.post_id) {
    const { data: post } = await admin.from("posts").select("video_id").eq("id", r.post_id).single();
    if (post?.video_id) {
      await admin.from("videos").update({ removed_at: new Date().toISOString(), removed_reason: reason }).eq("id", post.video_id);
    } else {
      await admin.from("posts").delete().eq("id", r.post_id);
    }
  }
  await admin.from("reports").update({ status: "actioned" }).eq("id", id);
  revalidatePath("/admin");
}

const inviteSchema = z.object({ note: z.string().trim().max(200), maxUses: z.coerce.number().int().min(1).max(1000) });

export async function createInvite(formData: FormData) {
  const { admin, userId } = await requireAdmin();
  const input = inviteSchema.parse({ note: formData.get("note") ?? "", maxUses: formData.get("maxUses") ?? 1 });
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alike characters
  const code = Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
  await admin.from("invite_codes").insert({ code, note: input.note, max_uses: input.maxUses, created_by: userId });
  revalidatePath("/admin");
}
