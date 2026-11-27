"use client";
import { useRef, useState } from "react";
import { UpChunk } from "@mux/upchunk";
import { Download, Loader2, X, CheckCircle2 } from "lucide-react";
import { MAX_EXPORT_S, totalLength, type Project } from "@/lib/editor/model";
import { Engine } from "./engine";
import { fmtTime } from "./store";

type Stage = { step: "setup" } | { step: "render"; progress: number } | { step: "upload"; progress: number } | { step: "done"; videoId: string | null } | { step: "error"; message: string };

export function ExportDialog({ getEngine, project, title, setTitle, setPostText, topics, singleSource, onClose }: {
  getEngine: () => Engine;
  project: Project;
  title: string;
  setTitle: (t: string) => void;
  setPostText: (t: string) => void;
  topics: { id: number; name: string }[];
  singleSource: string | null;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ step: "setup" });
  const [visibility, setVisibility] = useState<"public" | "followers" | "unlisted">("public");
  const [topicId, setTopicId] = useState<string>("");
  const [rights, setRights] = useState(false);
  const [publish, setPublish] = useState(true);
  const abort = useRef<AbortController | null>(null);
  const file = useRef<Blob | null>(null);
  const [hasFile, setHasFile] = useState(false);
  const len = totalLength(project);
  const tooLong = len > MAX_EXPORT_S;
  const supported = Engine.exportType() !== null;

  async function run() {
    abort.current = new AbortController();
    setStage({ step: "render", progress: 0 });
    let blob: Blob;
    try {
      blob = await getEngine().record((f) => setStage({ step: "render", progress: f }), abort.current.signal);
      file.current = blob;
      setHasFile(true);
    } catch (e) {
      if ((e as Error).name === "AbortError") return setStage({ step: "setup" });
      return setStage({ step: "error", message: (e as Error).message || "Export failed. Try again." });
    }
    if (!publish) return setStage({ step: "done", videoId: null });

    setStage({ step: "upload", progress: 0 });
    const res = await fetch("/api/uploads", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || "Untitled", description: "", visibility,
        topicId: topicId ? Number(topicId) : null, sourceVideoId: singleSource,
        rightsConfirmed: true, postText: project.postText, captionLanguage: "en",
      }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    if (!res?.ok) return setStage({ step: "error", message: data?.error ?? "Couldn't start the upload." });
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    const up = UpChunk.createUpload({ endpoint: data.uploadUrl, file: new File([blob], `cast-edit.${ext}`, { type: blob.type }), chunkSize: 30720 * 2 });
    up.on("progress", (ev) => setStage({ step: "upload", progress: (ev.detail as number) / 100 }));
    up.on("error", () => setStage({ step: "error", message: "Upload failed. Check your connection and try again. You can still download the file." }));
    up.on("success", () => setStage({ step: "done", videoId: data.videoId }));
  }

  function download() {
    if (!file.current) return;
    const url = URL.createObjectURL(file.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "cast-edit").replace(/[^\w\- ]+/g, "").trim() || "cast-edit"}.${file.current.type.includes("mp4") ? "mp4" : "webm"}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  const field = "w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm";
  const busy = stage.step === "render" || stage.step === "upload";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Export">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-neutral-200 bg-raised p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Export &amp; publish</h2>
          {!busy && <button onClick={onClose} aria-label="Close"><X /></button>}
        </div>

        {stage.step === "setup" && (
          <div className="flex flex-col gap-3">
            {!supported && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">This browser can&apos;t export video. Use Chrome, Edge or Safari on a computer.</p>}
            {tooLong && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">Edits can be up to {fmtTime(MAX_EXPORT_S)} long. This one is {fmtTime(len)}.</p>}
            <input className={field} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <textarea className={field} rows={3} maxLength={1000} value={project.postText} onChange={(e) => setPostText(e.target.value)} placeholder="Say something to your followers (optional)" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} /> Publish to Cast when it&apos;s done</label>
            {publish && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <select className={field} value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
                    <option value="public">Everyone</option><option value="followers">Followers only</option><option value="unlisted">Unlisted</option>
                  </select>
                  <select className={field} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                    <option value="">No topic</option>
                    {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={rights} onChange={(e) => setRights(e.target.checked)} /> I own or have the rights to everything in this video.</label>
              </>
            )}
            <p className="text-xs text-neutral-500">Exporting plays your edit once at full quality, so it takes about {fmtTime(len)}. Keep this tab open.</p>
            <button disabled={!supported || tooLong || !len || (publish && !rights)} onClick={run} className="bg-brand rounded-full py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
              {publish ? "Export and publish" : "Export file"}
            </button>
          </div>
        )}

        {(stage.step === "render" || stage.step === "upload") && (
          <div className="flex flex-col gap-3">
            <p className="flex items-center gap-2 font-medium"><Loader2 size={18} className="animate-spin" /> {stage.step === "render" ? "Rendering your edit…" : "Uploading to Cast…"}</p>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className="bg-brand h-full transition-all" style={{ width: `${Math.round(stage.progress * 100)}%` }} /></div>
            <p className="text-sm text-neutral-500">{Math.round(stage.progress * 100)}%{stage.step === "render" ? " · keep this tab open and in front" : ""}</p>
            {stage.step === "render" && <button onClick={() => abort.current?.abort()} className="self-start text-sm text-red-600 underline">Cancel</button>}
          </div>
        )}

        {stage.step === "done" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 size={40} className="text-blue-400" />
            <p className="font-semibold">{stage.videoId ? "Uploaded. It goes live after a minute or two of processing." : "Your video is ready."}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button onClick={download} className="flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold"><Download size={16} /> Download file</button>
              {stage.videoId && <a href="/studio/library" className="bg-brand rounded-full px-4 py-2 text-sm font-semibold text-white">Go to Library</a>}
            </div>
            <button onClick={onClose} className="text-sm text-neutral-500 underline">Keep editing</button>
          </div>
        )}

        {stage.step === "error" && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl bg-red-100 p-3 text-sm text-red-800">{stage.message}</p>
            <div className="flex gap-2">
              {hasFile && <button onClick={download} className="flex items-center gap-2 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold"><Download size={16} /> Download file</button>}
              <button onClick={() => setStage({ step: "setup" })} className="rounded-full border border-neutral-300 px-4 py-2 text-sm">Try again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
