"use client";
import { useState } from "react";
import { UpChunk } from "@mux/upchunk";
import { CAPTION_LANGUAGES } from "@/lib/validation";

type Topic = { id: number; name: string };
const MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB is plenty for 30 minutes at 1080p
const MAX_SECONDS = 30 * 60;

function readDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => { URL.revokeObjectURL(el.src); resolve(el.duration); };
    el.onerror = () => resolve(0); // unknown; the server checks again after processing
    el.src = URL.createObjectURL(file);
  });
}

export function UploadForm({ topics, initialFile = null }: { topics: Topic[]; initialFile?: File | null }) {
  const [file, setFile] = useState<File | null>(initialFile);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    if (!file) return setMessage("Choose a video first.");
    if (!file.type.startsWith("video/")) return setMessage("That file isn't a video.");
    if (file.size > MAX_BYTES) return setMessage("That file is too large.");
    if ((await readDuration(file)) > MAX_SECONDS + 1) return setMessage("Videos can be up to 30 minutes long during the beta.");

    const form = new FormData(e.currentTarget);
    const topic = Number(form.get("topicId"));
    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description") ?? "",
        visibility: form.get("visibility"),
        topicId: topic > 0 ? topic : null,
        postText: form.get("postText") ?? "",
        rightsConfirmed: form.get("rights") === "on",
        captionLanguage: form.get("captionLanguage") ?? "en",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage(data.error ?? "Upload failed to start.");

    setProgress(0);
    const upload = UpChunk.createUpload({ endpoint: data.uploadUrl, file, chunkSize: 30720 * 2 });
    upload.on("progress", (ev) => setProgress(Math.round(ev.detail as number)));
    upload.on("error", () => { setProgress(null); setMessage("Upload failed. Check your connection and try again."); });
    upload.on("success", () => { setProgress(100); setVideoId(data.videoId); });
  }

  if (videoId) {
    return (
      <div className="rounded-2xl bg-green-50 p-4 text-green-900">
        Uploaded. Your video is processing and will appear in the feed in a minute or two.{" "}
        <a className="font-semibold underline" href={`/v/${videoId}`}>View it</a> or <a className="font-semibold underline" href="/studio">upload another</a>.
      </div>
    );
  }

  const field = "w-full rounded-xl border border-neutral-300 px-3 py-2";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {initialFile ? null : <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 p-8 text-center">
        <span className="text-4xl">⬆</span>
        <span className="font-medium">{file ? file.name : "Choose a video from your phone or computer"}</span>
        <span className="text-sm text-neutral-500">MP4 or MOV, up to 30 minutes</span>
        <input type="file" accept="video/mp4,video/quicktime,video/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>}
      <input name="title" required maxLength={120} placeholder="Title" className={field} />
      <textarea name="description" maxLength={5000} rows={3} placeholder="Description (optional)" className={field} />
      <textarea name="postText" maxLength={1000} rows={2} placeholder="Say something to your followers (optional)" className={field} />
      <div className="flex gap-3">
        <select name="topicId" className={field} defaultValue="0">
          <option value="0">Choose a topic</option>
          {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select name="visibility" className={field} defaultValue="public">
          <option value="public">Public</option>
          <option value="followers">Followers only</option>
          <option value="unlisted">Unlisted</option>
        </select>
      </div>
      <label className="block text-sm">
        <span className="font-medium">Spoken language</span>
        <span className="block text-neutral-500">Captions are added automatically in this language.</span>
        <select name="captionLanguage" className={field} defaultValue="en">
          {Object.entries(CAPTION_LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rights" required className="mt-1" />
        I made this video or have the rights to post it.
      </label>
      {progress !== null ? (
        <div className="h-3 overflow-hidden rounded-full bg-neutral-200" role="progressbar" aria-valuenow={progress}>
          <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : (
        <button className="rounded-full bg-blue-600 py-3 font-semibold text-white">Publish</button>
      )}
      {message && <p role="alert" className="text-red-600">{message}</p>}
    </form>
  );
}
