import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { ClipEditor } from "@/components/client/clip-editor";
import { StudioNav } from "@/components/studio-nav";

export default function ClipPage(props: PageProps<"/studio/clip/[id]">) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <StudioNav active="/studio/library" />
      <h1 className="mb-4 text-xl font-bold">Trim or cut a clip</h1>
      <Suspense fallback={null}><Inner {...props} /></Suspense>
    </div>
  );
}

async function Inner({ params }: PageProps<"/studio/clip/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const { data: v } = await supabase.from("videos").select("id, title, creator_id, status, mux_playback_id, duration_s").eq("id", id).maybeSingle();
  if (!v || v.creator_id !== user.id) notFound();
  if (v.status !== "ready" || !v.mux_playback_id) return <p className="text-neutral-500">This video is still processing.</p>;
  return <ClipEditor video={{ id: v.id, title: v.title, playbackId: v.mux_playback_id, duration: Number(v.duration_s ?? 0) }} />;
}
