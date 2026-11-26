"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { emptyProject, projectSchema, addClip } from "@/lib/editor/model";

// Starts a new editor project, optionally with one of the creator's videos already on the timeline.
export async function createProject(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/studio/editor");
  const videoId = z.uuid().safeParse(formData.get("videoId"));
  let project = emptyProject();
  let title = "Untitled project";
  if (videoId.success) {
    const { data: v } = await supabase.from("videos").select("id, title, creator_id, duration_s, status")
      .eq("id", videoId.data).maybeSingle();
    if (v && v.creator_id === user.id && v.status === "ready") {
      project = addClip(project, { source: v.id, in: 0, out: Number(v.duration_s ?? 0) || 1 });
      title = `${v.title || "Untitled"} (edit)`.slice(0, 120);
    }
  }
  const { data, error } = await supabase.from("studio_projects")
    .insert({ creator_id: user.id, title, origin: "desktop", edit_list: project }).select("id").single();
  if (error || !data) throw new Error("Couldn't create the project.");
  redirect(`/studio/editor/${data.id}`);
}

const saveSchema = z.object({ id: z.uuid(), title: z.string().trim().min(1).max(120), project: projectSchema });

export async function saveProject(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getUser();
  if (!user) return { ok: false, error: "Sign in again to save." };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This edit couldn't be saved." };
  const { id, title, project } = parsed.data;
  const { error } = await supabase.from("studio_projects")
    .update({ title, edit_list: project, updated_at: new Date().toISOString() })
    .eq("id", id).eq("creator_id", user.id);
  return error ? { ok: false, error: "Couldn't save. Check your connection." } : { ok: true };
}

export async function deleteProject(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return;
  const id = z.uuid().safeParse(formData.get("id"));
  if (id.success) await supabase.from("studio_projects").delete().eq("id", id.data).eq("creator_id", user.id);
  redirect("/studio/editor");
}
