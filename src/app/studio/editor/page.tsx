import { Suspense } from "react";
import Link from "next/link";
import { Clapperboard, Plus } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { StudioNav } from "@/components/studio-nav";
import { createProject } from "@/app/actions/editor";
import { duration } from "@/lib/format";
import { loadProject, totalLength } from "@/lib/editor/model";

export default function EditorHome() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4">
      <StudioNav active="/studio/editor" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Editor</h1>
          <p className="text-neutral-500">Cut, caption and package your videos, with AI doing the busy work.</p>
        </div>
        <form action={createProject}>
          <button className="bg-brand flex items-center gap-2 rounded-full px-5 py-2.5 font-semibold text-white transition hover:brightness-110"><Plus size={18} /> New project</button>
        </form>
      </div>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}><Lists /></Suspense>
    </div>
  );
}

async function Lists() {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const [{ data: projects }, { data: videos }] = await Promise.all([
    supabase.from("studio_projects").select("id, title, edit_list, updated_at")
      .eq("creator_id", user.id).eq("edit_list->>version", "2").order("updated_at", { ascending: false }).limit(50),
    supabase.from("videos").select("id, title, duration_s, mux_playback_id")
      .eq("creator_id", user.id).eq("status", "ready").not("mux_playback_id", "is", null)
      .order("created_at", { ascending: false }).limit(12),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 font-semibold">Your projects</h2>
        {!projects?.length ? (
          <p className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-neutral-500">No projects yet. Start one from a video below, or start blank.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => {
              const proj = loadProject(p.edit_list);
              return (
                <li key={p.id}>
                  <Link href={`/studio/editor/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-neutral-200 p-4 transition hover:border-blue-500">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100"><Clapperboard size={20} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="text-sm text-neutral-500">{proj.aspect} · {proj.clips.length} clip{proj.clips.length === 1 ? "" : "s"} · {duration(totalLength(proj))}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Start from a video</h2>
        {!videos?.length ? <p className="text-neutral-500">Upload a video first, then edit it here.</p> : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {videos.map((v) => (
              <li key={v.id}>
                <form action={createProject}>
                  <input type="hidden" name="videoId" value={v.id} />
                  <button className="group w-full text-left">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`https://image.mux.com/${v.mux_playback_id}/thumbnail.webp?width=360&time=1`} alt="" className="aspect-video w-full rounded-xl bg-neutral-100 object-cover transition group-hover:opacity-80" />
                    <span className="mt-1 block truncate text-sm font-medium">{v.title || "Untitled"}</span>
                    <span className="text-xs text-neutral-500">{duration(v.duration_s)}</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
