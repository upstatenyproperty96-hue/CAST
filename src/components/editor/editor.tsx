"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pause, Play, Redo2, Scissors, SkipBack, Undo2, ZoomIn, ZoomOut, Upload, Check, Loader2, AlertCircle } from "lucide-react";
import {
  ASPECTS, commit, duplicateClip, redo, removeClip, removeText, splitAt, startHistory, timelineCaptions, totalLength, undo, updateText,
  type Cue, type History, type Project,
} from "@/lib/editor/model";
import { saveProject } from "@/app/actions/editor";
import { Engine, type SourceInfo } from "./engine";
import { Timeline, type Selection } from "./timeline";
import { Inspector } from "./inspector";
import { AiPanel, CaptionsPanel, FormatPanel, MediaPanel, TABS, TextPanel, type LibraryVideo, type Tab } from "./panels";
import { ExportDialog } from "./export-dialog";
import { createStore, fmtTime, useStore } from "./store";

type Props = {
  projectId: string;
  initialTitle: string;
  initialProject: Project;
  library: LibraryVideo[];
  topics: { id: number; name: string }[];
};

export function Editor({ projectId, initialTitle, initialProject, library, topics }: Props) {
  const [history, setHistory] = useState<History>(() => startHistory(initialProject));
  // While dragging, the timeline shows a live draft that only lands in history on release.
  const [draft, setDraft] = useState<Project | null>(null);
  const project = draft ?? history.present;
  const [title, setTitle] = useState(initialTitle);
  const [tab, setTab] = useState<Tab>(initialProject.clips.length ? "ai" : "media");
  const [selection, setSelection] = useState<Selection>(null);
  const [pps, setPps] = useState(40);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [cues, setCues] = useState<Record<string, Cue[] | undefined>>({});
  const [saved, setSaved] = useState({ project: initialProject, title: initialTitle });
  const [saveFailed, setSaveFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [time] = useState(() => createStore(0));
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const cueRequests = useRef(new Map<string, Promise<Cue[]>>());

  const sources = useMemo(() => Object.fromEntries(library.map((v) => [v.id, { playbackId: v.playbackId, duration: v.duration, title: v.title, src: v.src } satisfies SourceInfo])), [library]);
  const captions = useMemo(() => timelineCaptions(project, cues), [project, cues]);

  const apply = useCallback((next: Project) => { setDraft(null); setHistory((h) => commit(h, next)); }, []);

  // Engine lifecycle.
  useEffect(() => {
    const e = new Engine(canvas.current!, sources, history.present);
    e.onTime = (t) => time.set(t);
    e.onPlayingChange = setPlaying;
    e.onWaiting = setWaiting;
    engine.current = e;
    e.seek(0);
    return () => e.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { engine.current?.setSources(sources); }, [sources]);
  useEffect(() => { engine.current?.setProject(project); }, [project]);
  useEffect(() => { if (engine.current) { engine.current.captions = captions; engine.current.draw(); } }, [captions]);
  useEffect(() => { if (engine.current) { engine.current.selectedTextId = selection?.kind === "text" ? selection.id : null; engine.current.draw(); } }, [selection]);

  // Captions are fetched once per source video, the first time something needs them.
  const loadCues = useCallback(async (ids: string[]) => {
    const result: Record<string, Cue[] | undefined> = {};
    await Promise.all(ids.map(async (id) => {
      let req = cueRequests.current.get(id);
      if (!req) {
        req = fetch(`/api/editor/transcript?videoId=${id}`).then((r) => r.json()).then((d) => (d.cues ?? []) as Cue[]).catch(() => []);
        cueRequests.current.set(id, req);
      }
      result[id] = await req;
    }));
    setCues((c) => ({ ...c, ...result }));
    return { ...cues, ...result };
  }, [cues]);

  useEffect(() => {
    if (!project.captions.enabled) return;
    const missing = [...new Set(project.clips.map((c) => c.source))].filter((id) => !cueRequests.current.has(id));
    if (missing.length) void loadCues(missing);
  }, [project.captions.enabled, project.clips, loadCues]);

  // Autosave a moment after the last change.
  const dirty = saved.project !== history.present || saved.title !== title;
  const save = saveFailed ? "error" : dirty ? "saving" : "saved";
  useEffect(() => {
    if (!dirty || draft) return;
    const snapshot = { project: history.present, title };
    const id = setTimeout(async () => {
      const res = await saveProject({ id: projectId, title: snapshot.title.trim() || "Untitled project", project: snapshot.project }).catch(() => ({ ok: false as const, error: "" }));
      if (res.ok) { setSaved(snapshot); setSaveFailed(false); } else setSaveFailed(true);
    }, 1000);
    return () => clearTimeout(id);
  }, [dirty, history.present, title, projectId, draft]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save !== "saved" || exporting) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save, exporting]);

  const seek = useCallback((t: number) => { engine.current?.pause(); engine.current?.seek(t); }, []);
  const split = useCallback(() => apply(splitAt(history.present, time.get())), [apply, history.present, time]);

  // Keyboard shortcuts, like a desktop editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (exporting || el.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      const p = history.present;
      if (e.code === "Space") { e.preventDefault(); void engine.current?.toggle(); }
      else if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); setHistory((h) => (e.shiftKey ? redo(h) : undo(h))); }
      else if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); setHistory(redo); }
      else if (e.key === "s" && !mod) split();
      else if (e.key === "d" && !mod && selection?.kind === "clip") apply(duplicateClip(p, selection.id));
      else if ((e.key === "Delete" || e.key === "Backspace") && selection) {
        apply(selection.kind === "clip" ? removeClip(p, selection.id) : removeText(p, selection.id));
        setSelection(null);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = (e.shiftKey ? 1 : 1 / 30) * (e.key === "ArrowLeft" ? -1 : 1);
        seek(time.get() + step);
      } else if (e.key === "+" || e.key === "=") setPps((z) => Math.min(300, z * 1.4));
      else if (e.key === "-") setPps((z) => Math.max(4, z / 1.4));
      else if (e.key === "Home") seek(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [history.present, selection, apply, split, seek, time, exporting]);

  // Drag text on the preview to place it.
  function previewPointer(e: React.PointerEvent<HTMLCanvasElement>) {
    const eng = engine.current;
    const el = e.currentTarget;
    if (!eng) return;
    const r = el.getBoundingClientRect();
    const sx = el.width / r.width, sy = el.height / r.height;
    const hit = eng.textAt((e.clientX - r.left) * sx, (e.clientY - r.top) * sy);
    if (!hit) { setSelection(null); void eng.toggle(); return; }
    setSelection({ kind: "text", id: hit });
    el.setPointerCapture(e.pointerId);
    const item = project.texts.find((t) => t.id === hit)!;
    const start = { x: e.clientX, y: e.clientY };
    let latest = project;
    const move = (ev: PointerEvent) => {
      const x = Math.max(0.02, Math.min(0.98, item.x + (ev.clientX - start.x) / r.width));
      const y = Math.max(0.02, Math.min(0.98, item.y + (ev.clientY - start.y) / r.height));
      latest = updateText(project, hit, { x, y });
      setDraft(latest);
    };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); if (latest !== project) apply(latest); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  const a = ASPECTS[project.aspect];
  const len = totalLength(project);
  const sourcesUsed = [...new Set(project.clips.map((c) => c.source))];
  const singleSource = sourcesUsed.length === 1 && !library.find((v) => v.id === sourcesUsed[0])?.isClip ? sourcesUsed[0] : null;
  const common = { project, apply, time: () => time.get() };
  const timelineBlock = (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-end gap-1 text-neutral-500">
          <button onClick={() => setPps((z) => Math.max(4, z / 1.4))} className="rounded p-1 hover:bg-neutral-100" aria-label="Zoom out"><ZoomOut size={16} /></button>
          <input type="range" min={4} max={300} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="w-28" aria-label="Timeline zoom" />
          <button onClick={() => setPps((z) => Math.min(300, z * 1.4))} className="rounded p-1 hover:bg-neutral-100" aria-label="Zoom in"><ZoomIn size={16} /></button>
        </div>
        <Timeline project={project} sources={sources} captions={captions} time={time} pps={pps} selection={selection}
          onSelect={setSelection} onSeek={seek}
          onChange={(p, final) => (final ? apply(p) : setDraft(p))} />
      </div>
    );

  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:h-dvh lg:overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <Link href="/studio/editor" className="rounded-full p-2 hover:bg-neutral-100" aria-label="Back to projects"><ArrowLeft size={20} /></Link>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Project title"
          className="min-w-0 flex-1 rounded-lg border border-transparent !bg-transparent px-2 py-1 font-semibold hover:border-neutral-300 focus:border-neutral-300" />
        <span className="hidden items-center gap-1 text-xs text-neutral-500 sm:flex">
          {save === "saving" ? <><Loader2 size={14} className="animate-spin" /> Saving</> : save === "error" ? <><AlertCircle size={14} className="text-red-600" /> Not saved</> : <><Check size={14} /> Saved</>}
        </span>
        <button onClick={() => setHistory(undo)} disabled={!history.past.length} className="rounded-full p-2 hover:bg-neutral-100 disabled:opacity-30" aria-label="Undo" title="Undo (Ctrl/⌘ Z)"><Undo2 size={18} /></button>
        <button onClick={() => setHistory(redo)} disabled={!history.future.length} className="rounded-full p-2 hover:bg-neutral-100 disabled:opacity-30" aria-label="Redo" title="Redo (Shift Ctrl/⌘ Z)"><Redo2 size={18} /></button>
        <button onClick={() => { engine.current?.pause(); setExporting(true); }} disabled={!project.clips.length} className="bg-brand flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
          <Upload size={16} /> Export
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Tools */}
        <aside className="order-3 flex min-h-0 flex-col border-neutral-200 lg:order-1 lg:w-80 lg:border-r">
          <nav className="no-scrollbar flex overflow-x-auto border-b border-neutral-200">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-0.5 px-3 py-2 text-[11px] ${tab === t.id ? "text-blue-400" : "text-neutral-500"}`}>
                <t.icon size={18} />{t.label}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {tab === "media" && <MediaPanel {...common} library={library} />}
            {tab === "ai" && <AiPanel {...common} library={library} cues={cues} loadCues={loadCues} onPackage={(r) => { setTitle(r.title.slice(0, 120)); apply({ ...project, postText: r.postText.slice(0, 1000) }); }} />}
            {tab === "text" && <TextPanel {...common} onAdded={(id) => setSelection({ kind: "text", id })} />}
            {tab === "captions" && <CaptionsPanel {...common} loadCues={loadCues} />}
            {tab === "format" && <FormatPanel {...common} />}
          </div>
        </aside>

        {/* Preview */}
        <main className="order-1 flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3 lg:order-2">
          <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
            <canvas ref={canvas} onPointerDown={previewPointer}
              className="max-h-[55vh] max-w-full touch-none rounded-xl bg-black shadow-2xl shadow-black/50 lg:max-h-full"
              style={{ aspectRatio: `${a.w} / ${a.h}` }} />
            {waiting && playing && <Loader2 className="absolute animate-spin text-white" size={32} />}
            {!project.clips.length && (
              <p className="pointer-events-none absolute max-w-xs text-center text-sm text-neutral-500">Pick a video from Media, or let AI find clips for you.</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => seek(0)} className="rounded-full p-2 hover:bg-neutral-100" aria-label="Back to start"><SkipBack size={18} /></button>
            <button onClick={() => void engine.current?.toggle()} disabled={!project.clips.length} className="bg-brand flex h-11 w-11 items-center justify-center rounded-full text-white disabled:opacity-50" aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
            </button>
            <button onClick={split} disabled={!project.clips.length} className="rounded-full p-2 hover:bg-neutral-100 disabled:opacity-30" aria-label="Split at playhead" title="Split (S)"><Scissors size={18} /></button>
            <TimeReadout time={time} len={len} />
          </div>
        </main>

        {/* Inspector */}
        <aside className="order-4 hidden border-l border-neutral-200 p-3 lg:block lg:w-72 lg:overflow-y-auto">
          <Inspector project={project} sources={sources} selection={selection} apply={apply} onSplit={split} onSelect={setSelection} />
        </aside>

        {/* Timeline (mobile places it under the preview) */}
        <div className="order-2 px-3 pb-2 lg:hidden">
          {timelineBlock}
          {selection && <div className="mt-3 rounded-xl border border-neutral-200 p-3"><Inspector project={project} sources={sources} selection={selection} apply={apply} onSplit={split} onSelect={setSelection} /></div>}
        </div>
      </div>

      <div className="hidden border-t border-neutral-200 p-3 lg:block">{timelineBlock}</div>

      {exporting && (
        <ExportDialog getEngine={() => engine.current!} project={history.present} title={title} setTitle={setTitle}
          setPostText={(t) => apply({ ...history.present, postText: t })} topics={topics} singleSource={singleSource} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

function TimeReadout({ time, len }: { time: ReturnType<typeof createStore<number>>; len: number }) {
  const t = useStore(time);
  return <span className="w-28 text-sm tabular-nums text-neutral-600">{fmtTime(t, true)} / {fmtTime(len, true)}</span>;
}
