"use client";
import { useEffect, useRef, useState } from "react";
import { UploadForm } from "./upload-form";

type Topic = { id: number; name: string };
type Source = "camera" | "screen";

const isPhone = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function pickMimeType() {
  const options = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
  return options.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) ?? "";
}

export function Recorder({ topics }: { topics: Topic[] }) {
  const preview = useRef<HTMLVideoElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [source, setSource] = useState<Source>("camera");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [state, setState] = useState<"idle" | "ready" | "recording" | "paused" | "done">("idle");
  const [seconds, setSeconds] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const maxSeconds = isPhone() ? 10 * 60 : 30 * 60;

  function stopTracks() {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function start() {
    setError(null);
    stopTracks();
    try {
      let s: MediaStream;
      if (source === "screen") {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).catch(() => null);
        s = new MediaStream([...screen.getVideoTracks(), ...(mic?.getAudioTracks() ?? screen.getAudioTracks())]);
      } else {
        s = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
            : { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }
      stream.current = s;
      if (preview.current) { preview.current.srcObject = s; preview.current.muted = true; await preview.current.play().catch(() => undefined); }
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "videoinput"));
      setState("ready");
    } catch {
      setError("Cast needs permission to use your camera and microphone. Allow it in your browser settings and try again.");
    }
  }

  function record() {
    if (!stream.current) return;
    chunks.current = [];
    const mimeType = pickMimeType();
    const r = new MediaRecorder(stream.current, { mimeType: mimeType || undefined, videoBitsPerSecond: 5_000_000 });
    r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      const type = r.mimeType || "video/webm";
      const blob = new Blob(chunks.current, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      setFile(new File([blob], `recording-${Date.now()}.${ext}`, { type }));
      stopTracks();
      setState("done");
    };
    r.start(1000);
    recorder.current = r;
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (r.state === "recording" && s + 1 >= maxSeconds) stop();
        return r.state === "recording" ? s + 1 : s;
      });
    }, 1000);
  }

  function togglePause() {
    const r = recorder.current;
    if (!r) return;
    if (r.state === "recording") { r.pause(); setState("paused"); } else if (r.state === "paused") { r.resume(); setState("recording"); }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  function retake() {
    setFile(null);
    setState("idle");
    setSeconds(0);
  }

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); stopTracks(); }, []);

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  if (state === "done" && file) {
    return (
      <div className="flex flex-col gap-4">
        <video src={URL.createObjectURL(file)} controls playsInline className="w-full rounded-2xl bg-black" />
        <button onClick={retake} className="self-start text-sm text-blue-600">Retake</button>
        <UploadForm topics={topics} initialFile={file} />
      </div>
    );
  }

  const select = "rounded-lg border border-neutral-300 px-2 py-1 text-sm";
  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="relative flex-1 overflow-hidden rounded-2xl bg-black">
        <video ref={preview} playsInline className="aspect-video w-full object-cover" />
        {state === "idle" && (
          <button onClick={start} className="absolute inset-0 m-auto h-12 w-48 rounded-full bg-neutral-900 font-semibold text-canvas">Turn on camera</button>
        )}
        {(state === "recording" || state === "paused") && (
          <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-sm font-semibold text-white">
            {state === "paused" ? "Paused" : "● REC"} {mmss}
          </span>
        )}
      </div>
      <aside className="flex flex-col gap-3 md:w-56">
        <label className="text-sm font-medium">Source
          <select className={`${select} w-full`} value={source} disabled={state === "recording" || state === "paused"}
            onChange={(e) => { setSource(e.target.value as Source); setState("idle"); stopTracks(); }}>
            <option value="camera">Camera</option>
            {!isPhone() && <option value="screen">Screen and mic</option>}
          </select>
        </label>
        {source === "camera" && devices.length > 1 && !isPhone() && (
          <label className="text-sm font-medium">Camera
            <select className={`${select} w-full`} value={cameraId} onChange={(e) => { setCameraId(e.target.value); setState("idle"); }}>
              <option value="">Default</option>
              {devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
            </select>
          </label>
        )}
        {source === "camera" && isPhone() && state === "ready" && (
          <button className={select} onClick={() => { setFacing((f) => (f === "user" ? "environment" : "user")); setTimeout(start, 0); }}>Flip camera</button>
        )}
        <p className="text-xs text-neutral-500">Up to {maxSeconds / 60} minutes per take.</p>
        {state === "ready" && <button onClick={record} className="rounded-full bg-red-600 py-3 font-semibold text-white">● Record</button>}
        {(state === "recording" || state === "paused") && (
          <>
            <button onClick={togglePause} className="rounded-full border border-neutral-300 py-3 font-semibold">{state === "paused" ? "Resume" : "Pause"}</button>
            <button onClick={stop} className="rounded-full bg-red-600 py-3 font-semibold text-white">■ Stop</button>
          </>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </aside>
    </div>
  );
}
