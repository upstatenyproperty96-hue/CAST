import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { loadProject } from "@/lib/editor/model";
import { Editor } from "@/components/editor/editor";

export default function EditorPage(props: PageProps<"/studio/editor/[id]">) {
  return <Suspense fallback={<p className="p-6 text-neutral-500">Opening editor…</p>}><Inner {...props} /></Suspense>;
}

async function Inner({ params }: PageProps<"/studio/editor/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/studio/editor");
  const [{ data: project }, { data: videos }, { data: topics }] = await Promise.all([
    supabase.from("studio_projects").select("id, title, edit_list, creator_id").eq("id", id).maybeSingle(),
    supabase.from("videos").select("id, title, duration_s, mux_playback_id, source_video_id")
      .eq("creator_id", user.id).eq("status", "ready").not("mux_playback_id", "is", null)
      .order("created_at", { ascending: false }).limit(200),
    supabase.from("topics").select("id, name").order("sort_order"),
  ]);
  if (!project || project.creator_id !== user.id) notFound();
  const library = (videos ?? []).map((v) => ({
    id: v.id, title: v.title || "Untitled", duration: Number(v.duration_s ?? 0), playbackId: v.mux_playback_id!, isClip: Boolean(v.source_video_id),
  }));
  return <Editor projectId={project.id} initialTitle={project.title} initialProject={loadProject(project.edit_list)} library={library} topics={topics ?? []} />;
}
