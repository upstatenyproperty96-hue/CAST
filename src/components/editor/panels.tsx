"use client";
import { useState } from "react";
import { Captions, Film, Plus, Scissors, Sparkles, Type, Wand2, LayoutTemplate, Loader2, Check } from "lucide-react";
import {
  ASPECTS, CAPTION_STYLES, TEXT_STYLES, addClip, addText, removeSilences, timelineCaptions,
  type Aspect, type CaptionStyle, type Cue, type Project, type TextStyle,
} from "@/lib/editor/model";
import { fmtTime } from "./store";

export type LibraryVideo = { id: string; title: string; duration: number; playbackId: string; isClip: boolean; src?: string };
export type Tab = "media" | "ai" | "text" | "captions" | "format";

export const TABS: { id: Tab; label: string; icon: typeof Film }[] = [
  { id: "media", label: "Media", icon: Film },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "text", label: "Text", icon: Type },
  { id: "captions", label: "Captions", icon: Captions },
  { id: "format", label: "Format", icon: LayoutTemplate },
];

type Common = {
  project: Project;
  apply: (p: Project) => void;
  time: () => number;
};

const btn = "flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-50";
const primary = `${btn} bg-brand text-white hover:brightness-110`;
const secondary = `${btn} border border-neutral-300 hover:border-blue-500`;

export function MediaPanel({ project, apply, library }: Common & { library: LibraryVideo[] }) {
  const [filter, setFilter] = useState("");
  const shown = library.filter((v) => v.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="flex flex-col gap-3">
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search your videos" className="rounded-full border border-neutral-300 px-4 py-2 text-sm" />
      {!shown.length && <p className="text-sm text-neutral-500">No ready videos. <a href="/studio" className="text-blue-400 underline">Upload one</a> and it shows up here.</p>}
      <ul className="grid grid-cols-2 gap-2">
        {shown.map((v) => (
          <li key={v.id}>
            <button onClick={() => apply(addClip(project, { source: v.id, in: 0, out: v.duration || 1 }))} className="group relative w-full overflow-hidden rounded-lg text-left" title="Add to the end of the timeline">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://image.mux.com/${v.playbackId}/thumbnail.webp?width=240&time=1`} alt="" className="aspect-video w-full bg-neutral-100 object-cover" />
              <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] text-white">{fmtTime(v.duration)}</span>
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100"><Plus className="text-white" /></span>
              <span className="mt-1 block truncate text-xs">{v.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

type Suggestion = { title: string; start: number; end: number; hook: string; caption: string; why: string; score: number };

export function AiPanel({ project, apply, library, cues, loadCues, onPackage }: Common & {
  library: LibraryVideo[];
  cues: Record<string, Cue[] | undefined>;
  loadCues: (ids: string[]) => Promise<Record<string, Cue[] | undefined>>;
  onPackage: (r: { title: string; postText: string; hook: string }) => void;
}) {
  const inProject = [...new Set(project.clips.map((c) => c.source))];
  const [source, setSource] = useState(inProject[0] ?? library.find((v) => !v.isClip)?.id ?? library[0]?.id ?? "");
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [ideas, setIdeas] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tone, setTone] = useState<"hype" | "friendly" | "professional" | "funny">("friendly");
  const [pkg, setPkg] = useState<{ title: string; postText: string; hook: string } | null>(null);

  async function findClips() {
    setBusy("clips"); setNote(null); setIdeas(null);
    const res = await fetch("/api/clips/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId: source, length }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(null);
    if (!res?.ok) return setNote({ kind: "err", text: data?.error ?? "AI is unavailable right now." });
    setIdeas(data.clips);
  }

  async function cutSilences() {
    setBusy("silence"); setNote(null);
    const all = await loadCues(inProject);
    setBusy(null);
    if (!inProject.some((id) => all[id]?.length)) return setNote({ kind: "err", text: "These videos have no captions yet, so AI can't hear where the pauses are." });
    const { project: next, removed } = removeSilences(project, all);
    if (removed < 0.2) return setNote({ kind: "ok", text: "No long pauses found. Your edit is already tight." });
    apply(next);
    setNote({ kind: "ok", text: `Cut ${fmtTime(removed, true)} of dead air. Press undo to bring it back.` });
  }

  async function writePackage() {
    setBusy("package"); setNote(null);
    const all = await loadCues(inProject);
    const transcript = timelineCaptions(project, all).map((c) => c.text).join(" ").slice(0, 50_000);
    const res = await fetch("/api/editor/assist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript, tone }) }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(null);
    if (!res?.ok) return setNote({ kind: "err", text: data?.error ?? "AI is unavailable right now." });
    setPkg(data);
  }

  const hasCaptions = inProject.some((id) => cues[id]?.length);

  return (
    <div className="flex flex-col gap-5">
      {note && <p role="status" className={`rounded-xl p-3 text-sm ${note.kind === "err" ? "bg-red-100 text-red-800" : "bg-green-50 text-green-900"}`}>{note.text}</p>}

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Sparkles size={16} className="text-blue-400" /> Find viral clips</h3>
        <p className="text-xs text-neutral-500">AI watches a long video and pulls out the moments most likely to take off.</p>
        <select value={source} onChange={(e) => { setSource(e.target.value); setIdeas(null); }} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          {library.map((v) => <option key={v.id} value={v.id}>{v.title} ({fmtTime(v.duration)})</option>)}
        </select>
        <div className="flex gap-2">
          <select value={length} onChange={(e) => setLength(e.target.value as typeof length)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="short">Shorts 15–60s</option>
            <option value="medium">Highlights 1–3 min</option>
            <option value="long">Segments 2–10 min</option>
          </select>
          <button onClick={findClips} disabled={!source || busy !== null} className={primary}>{busy === "clips" ? <Loader2 size={16} className="animate-spin" /> : "Find"}</button>
        </div>
        {ideas?.map((c, i) => (
          <div key={i} className="rounded-xl border border-neutral-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{c.title}</p>
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900">{c.score}</span>
            </div>
            <p className="text-xs text-neutral-500">{fmtTime(c.start)}–{fmtTime(c.end)} · {fmtTime(c.end - c.start)}</p>
            <p className="mt-1 text-xs italic text-neutral-700">&ldquo;{c.hook}&rdquo;</p>
            <div className="mt-2 flex gap-2">
              <button className={`${secondary} !px-3 !py-1 text-xs`} onClick={() => apply(addClip(project, { source, in: c.start, out: c.end }))}><Plus size={14} /> Add</button>
              <button className={`${secondary} !px-3 !py-1 text-xs`} onClick={() => {
                const withClip = addClip({ ...project, clips: [], texts: [] }, { source, in: c.start, out: c.end });
                apply({ ...withClip, texts: [{ id: `hook${Date.now()}`, text: c.title, start: 0, end: 3, style: "title", x: 0.5, y: 0.2, animation: "pop" }], captions: { ...project.captions, enabled: true }, postText: c.caption });
              }}><Wand2 size={14} /> Make it a short</button>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Scissors size={16} className="text-blue-400" /> Remove silences</h3>
        <p className="text-xs text-neutral-500">Cuts out pauses and dead air between sentences across the whole edit.</p>
        <button onClick={cutSilences} disabled={!project.clips.length || busy !== null} className={secondary}>{busy === "silence" ? <Loader2 size={16} className="animate-spin" /> : "Tighten my edit"}</button>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Captions size={16} className="text-blue-400" /> Auto captions</h3>
        <p className="text-xs text-neutral-500">Word-by-word captions that follow every cut. Style them in the Captions tab.</p>
        <button onClick={async () => { await loadCues(inProject); apply({ ...project, captions: { ...project.captions, enabled: !project.captions.enabled } }); }} disabled={!project.clips.length} className={secondary}>
          {project.captions.enabled ? <><Check size={16} /> Captions on</> : "Add captions"}
        </button>
        {project.captions.enabled && !hasCaptions && <p className="text-xs text-neutral-500">Captions appear once the videos finish auto-captioning.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Wand2 size={16} className="text-blue-400" /> Title, post & hook</h3>
        <p className="text-xs text-neutral-500">AI writes the packaging from what&apos;s said in your edit.</p>
        <div className="flex gap-2">
          <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm">
            <option value="friendly">Friendly</option><option value="hype">Hype</option><option value="funny">Funny</option><option value="professional">Professional</option>
          </select>
          <button onClick={writePackage} disabled={!project.clips.length || busy !== null} className={primary}>{busy === "package" ? <Loader2 size={16} className="animate-spin" /> : "Write"}</button>
        </div>
        {pkg && (
          <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 text-sm">
            <p><span className="text-neutral-500">Title:</span> {pkg.title}</p>
            <p><span className="text-neutral-500">Post:</span> {pkg.postText}</p>
            <p><span className="text-neutral-500">Hook:</span> {pkg.hook}</p>
            <div className="flex flex-wrap gap-2">
              <button className={`${secondary} !px-3 !py-1 text-xs`} onClick={() => onPackage(pkg)}>Use title & post</button>
              <button className={`${secondary} !px-3 !py-1 text-xs`} onClick={() => apply(addText(project, 0, pkg.hook, "title"))}>Add hook on screen</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function TextPanel({ project, apply, time, onAdded }: Common & { onAdded: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-500">Adds text at the playhead. Drag it on the preview to place it.</p>
      {(Object.keys(TEXT_STYLES) as TextStyle[]).map((k) => (
        <button key={k} className="rounded-xl border border-neutral-200 p-3 text-left transition hover:border-blue-500" onClick={() => {
          const next = addText(project, time(), k === "label" ? "NEW" : k === "quote" ? "“Say it here”" : TEXT_STYLES[k].label, k);
          apply(next);
          onAdded(next.texts.at(-1)!.id);
        }}>
          <span style={{ fontWeight: Number(TEXT_STYLES[k].weight) }} className={k === "title" ? "text-xl" : k === "label" ? "rounded bg-blue-400 px-2 text-sm text-black" : "text-base"}>{TEXT_STYLES[k].label}</span>
        </button>
      ))}
    </div>
  );
}

export function CaptionsPanel({ project, apply, loadCues }: Common & { loadCues: (ids: string[]) => Promise<unknown> }) {
  const c = project.captions;
  const set = (patch: Partial<Project["captions"]>) => apply({ ...project, captions: { ...c, ...patch } });
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center justify-between rounded-xl border border-neutral-200 p-3">
        <span className="font-medium">Show captions</span>
        <input type="checkbox" checked={c.enabled} onChange={async (e) => { const on = e.target.checked; if (on) await loadCues([...new Set(project.clips.map((x) => x.source))]); set({ enabled: on }); }} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(CAPTION_STYLES) as CaptionStyle[]).map((k) => {
          const st = CAPTION_STYLES[k];
          return (
            <button key={k} onClick={() => set({ style: k, enabled: true })} className={`rounded-xl border bg-black p-3 text-center ${c.style === k ? "border-blue-400" : "border-neutral-200"}`}>
              <span style={{ fontWeight: Number(st.font), color: st.color, background: st.box ?? undefined, WebkitTextStroke: st.stroke ? `0.5px ${st.stroke}` : undefined }} className="rounded px-1 text-sm">
                {st.upper ? "BIG " : "Big "}<span style={{ color: st.highlight ?? st.color }}>{st.upper ? "WORDS" : "words"}</span>
              </span>
              <span className="mt-1 block text-[11px] text-neutral-500">{st.label}</span>
            </button>
          );
        })}
      </div>
      <label className="text-sm">
        Position
        <input type="range" min={0.1} max={0.92} step={0.01} value={c.y} onChange={(e) => set({ y: Number(e.target.value) })} className="w-full" />
      </label>
    </div>
  );
}

export function FormatPanel({ project, apply }: Common) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(ASPECTS) as Aspect[]).map((k) => {
          const a = ASPECTS[k];
          const sel = project.aspect === k;
          return (
            <button key={k} onClick={() => apply({ ...project, aspect: k })} className={`flex flex-col items-center gap-2 rounded-xl border p-3 ${sel ? "border-blue-400 bg-blue-50" : "border-neutral-200"}`}>
              <span className="block rounded border-2 border-current" style={{ width: (a.w / Math.max(a.w, a.h)) * 36, height: (a.h / Math.max(a.w, a.h)) * 36 }} />
              <span className="text-sm font-medium">{a.label}</span>
              <span className="text-[11px] text-neutral-500">{a.hint}</span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center justify-between rounded-xl border border-neutral-200 p-3 text-sm">
        <span>Background behind fitted video</span>
        <select value={project.background} onChange={(e) => apply({ ...project, background: e.target.value as Project["background"] })} className="rounded-lg border border-neutral-300 px-2 py-1">
          <option value="blur">Blurred</option><option value="black">Black</option>
        </select>
      </label>
      <button className={secondary} onClick={() => apply({ ...project, clips: project.clips.map((c) => ({ ...c, fit: "fill" })) })}>Fill frame on every clip</button>
      <button className={secondary} onClick={() => apply({ ...project, clips: project.clips.map((c) => ({ ...c, fit: "fit" })) })}>Fit whole video on every clip</button>
    </div>
  );
}
