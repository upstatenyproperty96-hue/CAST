"use client";
import { useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ClipEditor({ video }: { video: { id: string; title: string; playbackId: string; duration: number } }) {
  const player = useRef<MuxPlayerElement>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(Math.min(video.duration, 60));
  const [title, setTitle] = useState(`${video.title} (clip)`);
  const [postText, setPostText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

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
    return <p className="rounded-2xl bg-green-50 p-4 text-green-900">Clip created. It will appear in the feed with a &quot;Watch full video&quot; link in a minute or two. <a className="underline" href="/studio/library">Back to Library</a></p>;
  }

  const range = "w-full accent-blue-600";
  return (
    <div className="flex flex-col gap-4">
      <MuxPlayer ref={player} playbackId={video.playbackId} streamType="on-demand" playsInline style={{ aspectRatio: "16 / 9", width: "100%" }} />
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
