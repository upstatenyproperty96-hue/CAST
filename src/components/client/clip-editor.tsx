"use client";
import { useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

type Suggestion = { title: string; start: number; end: number; hook: string; caption: string; why: string; score: number };

export function ClipEditor({ video }: { video: { id: string; title: string; playbackId: string; duration: number } }) {
  const player = useRef<MuxPlayerElement>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(video.duration, 60));
  const [title, setTitle] = useState(`${video.title} (clip)`);
  const [postText, setPostText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLength, setAiLength] = useState<"short" | "medium" | "long">("short");
  const [ideas, setIdeas] = useState<Suggestion[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  async function findMoments() {
    setAiBusy(true); setAiError(null); setIdeas(null); setPicked(null);
    const res = await fetch("/api/clips/suggest", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: video.id, length: aiLength }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setAiBusy(false);
    if (!res?.ok) return setAiError(data?.error ?? "AI is unavailable right now. Try again.");
    setIdeas(data.clips);
  }

  function loadIdea(i: number) {
    const c = ideas![i];
    setPicked(i); setStart(c.start); setEnd(c.end); setTitle(c.title.slice(0, 120)); setPostText(c.caption.slice(0, 1000));
    seek(c.start); player.current?.play().catch(() => {});
  }

  const now = () => player.current?.currentTime ?? 0;
  const seek = (t: number) => { if (player.current) player.current.currentTime = t; };

  async function save() {
    setBusy(true); setMessage(null);
    const res = await fetch("/api/clips", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceVideoId: video.id, title, start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, postText }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMessage(data.error ?? "Couldn't make the clip.");
    setDoneId(data.videoId);
  }

  if (doneId) {
    return <p className="rounded-2xl bg-green-50 p-4 text-green-900">Clip created. It will appear in the feed with a &quot;Watch full video&quot; link in a minute or two. <a className="underline" href="/studio/library">Back to Library</a>{" "}
      <button className="underline" onClick={() => { setDoneId(null); setPicked(null); }}>Make another clip</button></p>;
  }

  const range = "w-full accent-blue-600";
  return (
    <div className="flex flex-col gap-4">
      <MuxPlayer ref={player} playbackId={video.playbackId} streamType="on-demand" playsInline style={{ aspectRatio: "16 / 9", width: "100%" }} />
      <section className="rounded-2xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">✨ Find the best moments with AI</h2>
            <p className="text-sm text-neutral-500">AI reads what&apos;s said in your video and picks the clips most likely to take off.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={aiLength} onChange={(e) => setAiLength(e.target.value as typeof aiLength)} className="rounded-full border border-neutral-300 bg-transparent px-3 py-2 text-sm" aria-label="Clip length">
              <option value="short">Shorts (15–60s)</option>
              <option value="medium">Highlights (1–3 min)</option>
              <option value="long">Segments (2–10 min)</option>
            </select>
            <button onClick={findMoments} disabled={aiBusy} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {aiBusy ? "Watching your video…" : ideas ? "Try again" : "Find clips"}
            </button>
          </div>
        </div>
        {aiError && <p role="alert" className="mt-3 text-sm text-red-600">{aiError}</p>}
        {ideas && (
          <ul className="mt-3 flex flex-col gap-2">
            {ideas.map((c, i) => (
              <li key={i}>
                <button onClick={() => loadIdea(i)} className={`w-full rounded-xl border p-3 text-left ${picked === i ? "border-blue-600 bg-blue-50/10" : "border-neutral-200"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{c.title}</p>
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">{c.score}/100</span>
                  </div>
                  <p className="text-sm text-neutral-500">{fmt(c.start)}–{fmt(c.end)} · {fmt(c.end - c.start)} long</p>
                  <p className="mt-1 text-sm italic">&ldquo;{c.hook}&rdquo;</p>
                  <p className="mt-1 text-xs text-neutral-500">{c.why}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        {ideas && <p className="mt-2 text-xs text-neutral-500">Tap a moment to load it below, fine-tune the start and end, then create the clip.</p>}
      </section>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="font-medium">Start {fmt(start)}</p>
          <input type="range" min={0} max={video.duration} step={0.1} value={start} className={range}
            onChange={(e) => { const v = Math.min(Number(e.target.value), end - 1); setStart(v); seek(v); }} />
          <button className="text-blue-600" onClick={() => setStart(Math.min(now(), end - 1))}>Set start to current time</button>
        </div>
        <div>
          <p className="font-medium">End {fmt(end)}</p>
          <input type="range" min={0} max={video.duration} step={0.1} value={end} className={range}
            onChange={(e) => { const v = Math.max(Number(e.target.value), start + 1); setEnd(v); seek(v); }} />
          <button className="text-blue-600" onClick={() => setEnd(Math.max(now(), start + 1))}>Set end to current time</button>
        </div>
      </div>
      <p className="text-sm text-neutral-600">Clip length {fmt(end - start)} (up to 10 minutes)</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="rounded-xl border border-neutral-300 px-3 py-2" placeholder="Clip title" />
      <textarea value={postText} onChange={(e) => setPostText(e.target.value)} maxLength={1000} rows={2} className="rounded-xl border border-neutral-300 px-3 py-2" placeholder="Say something to your followers (optional)" />
      <button disabled={busy} onClick={save} className="rounded-full bg-blue-600 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Creating…" : "Create clip"}</button>
      {message && <p role="alert" className="text-red-600">{message}</p>}
    </div>
  );
}
