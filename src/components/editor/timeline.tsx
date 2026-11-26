"use client";
import { useEffect, useRef, useState } from "react";
import { Type } from "lucide-react";
import { clipLength, clipStarts, totalLength, type Cue, type Project } from "@/lib/editor/model";
import type { SourceInfo } from "./engine";
import { fmtTime, useStore, type Store } from "./store";

export type Selection = { kind: "clip" | "text"; id: string } | null;

type Props = {
  project: Project;
  sources: Record<string, SourceInfo>;
  captions: Cue[];
  time: Store<number>;
  pps: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onSeek: (t: number) => void;
  // Live preview while dragging; `final` is true on release so it lands in undo history once.
  onChange: (p: Project, final: boolean) => void;
};

const TRACK_H = 64;

export function Timeline({ project, sources, captions, time, pps, selection, onSelect, onSeek, onChange }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const len = totalLength(project);
  const width = Math.max(len * pps + 240, 600);
  const starts = clipStarts(project);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(len, (clientX - r.left + el.scrollLeft - 12) / pps));
  };

  function scrub(e: React.PointerEvent) {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    onSeek(timeAt(e.clientX));
    const move = (ev: PointerEvent) => onSeek(timeAt(ev.clientX));
    const up = () => { target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up); };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  // Dragging a clip's edge trims it; dragging its body reorders it.
  function clipPointer(e: React.PointerEvent, index: number, mode: "in" | "out" | "move") {
    e.stopPropagation();
    const clip = project.clips[index];
    onSelect({ kind: "clip", id: clip.id });
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const srcDur = sources[clip.source]?.duration || clip.out;
    let latest = project;
    let moved = false;
    const centers = project.clips.map((c, i) => (starts[i] + clipLength(c) / 2) * pps);
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      if (!moved) return;
      if (mode === "move") {
        const x = centers[index] + dx;
        setDrag({ from: index, to: centers.filter((c) => c < x).length });
        return;
      }
      const dSec = (dx / pps) * clip.speed;
      const next = project.clips.map((c) => {
        if (c.id !== clip.id) return c;
        if (mode === "in") return { ...c, in: Math.max(0, Math.min(clip.in + dSec, clip.out - 0.2)) };
        return { ...c, out: Math.min(srcDur, Math.max(clip.out + dSec, clip.in + 0.2)) };
      });
      latest = { ...project, clips: next };
      onChange(latest, false);
    };
    const up = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (!moved) { onSeek(timeAt(ev.clientX)); return; }
      if (mode === "move") {
        const x = centers[index] + (ev.clientX - startX);
        let to = centers.filter((c) => c < x).length;
        if (to > index) to -= 1;
        setDrag(null);
        if (to !== index) {
          const clips = [...project.clips];
          const [c] = clips.splice(index, 1);
          clips.splice(to, 0, c);
          onChange({ ...project, clips }, true);
        }
        return;
      }
      onChange(latest, true);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function textPointer(e: React.PointerEvent, id: string, mode: "start" | "end" | "move") {
    e.stopPropagation();
    onSelect({ kind: "text", id });
    const item = project.texts.find((t) => t.id === id)!;
    const startX = e.clientX;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let latest = project;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - startX) / pps;
      if (Math.abs(ev.clientX - startX) > 3) moved = true;
      if (!moved) return;
      const dur = item.end - item.start;
      const patch = mode === "start" ? { start: Math.max(0, Math.min(item.start + d, item.end - 0.3)) }
        : mode === "end" ? { end: Math.max(item.start + 0.3, item.end + d) }
        : { start: Math.max(0, item.start + d), end: Math.max(0, item.start + d) + dur };
      latest = { ...project, texts: project.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
      onChange(latest, false);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      if (moved) onChange(latest, true);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  const tickEvery = pps > 120 ? 1 : pps > 50 ? 2 : pps > 20 ? 5 : pps > 8 ? 10 : 30;
  const ticks = Array.from({ length: Math.ceil(width / pps / tickEvery) + 1 }, (_, i) => i * tickEvery);

  return (
    <div ref={scroller} className="no-scrollbar relative select-none overflow-x-auto overflow-y-hidden rounded-xl border border-neutral-200 bg-raised" onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
      <div className="relative px-3" style={{ width }}>
        {/* Ruler */}
        <div className="relative h-7 cursor-col-resize border-b border-neutral-200" onPointerDown={scrub}>
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 h-full border-l border-neutral-300 pl-1 text-[10px] text-neutral-500" style={{ left: t * pps }}>{fmtTime(t)}</div>
          ))}
        </div>

        {/* Video track */}
        <div className="relative my-2" style={{ height: TRACK_H }} onPointerDown={scrub}>
          {project.clips.length === 0 && (
            <div className="absolute inset-0 flex items-center rounded-lg border border-dashed border-neutral-300 px-4 text-sm text-neutral-500">Add a video from Media to start editing</div>
          )}
          {project.clips.map((c, i) => {
            const src = sources[c.source];
            const w = clipLength(c) * pps;
            const sel = selection?.kind === "clip" && selection.id === c.id;
            const thumbs = src ? Math.max(1, Math.floor(w / 90)) : 0;
            return (
              <div key={c.id}
                className={`group absolute top-0 h-full overflow-hidden rounded-lg border-2 bg-neutral-100 ${sel ? "z-10 border-blue-400" : "border-transparent"} ${drag?.from === i ? "opacity-60" : ""}`}
                style={{ left: starts[i] * pps, width: Math.max(4, w - 2) }}
                onPointerDown={(e) => clipPointer(e, i, "move")}>
                <div className="pointer-events-none absolute inset-0 flex">
                  {src && Array.from({ length: thumbs }, (_, k) => {
                    const at = c.in + ((c.out - c.in) * (k + 0.5)) / thumbs;
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={k} alt="" draggable={false} className="h-full flex-1 object-cover opacity-70"
                        src={`https://image.mux.com/${src.playbackId}/thumbnail.webp?width=120&time=${at.toFixed(1)}`} />
                    );
                  })}
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 px-2 pb-1 pt-3 text-[11px] font-medium text-white">
                  {src?.title ?? "Missing video"} · {fmtTime(clipLength(c), true)}{c.speed !== 1 ? ` · ${c.speed}×` : ""}
                </div>
                <div className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize bg-blue-400/0 transition group-hover:bg-blue-400/70" onPointerDown={(e) => clipPointer(e, i, "in")} />
                <div className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize bg-blue-400/0 transition group-hover:bg-blue-400/70" onPointerDown={(e) => clipPointer(e, i, "out")} />
              </div>
            );
          })}
          {drag && drag.to !== drag.from && (
            <div className="absolute top-0 z-20 h-full w-1 rounded bg-blue-400"
              style={{ left: (drag.to < project.clips.length ? starts[drag.to] : len) * pps - 2 }} />
          )}
        </div>

        {/* Text track */}
        <div className="relative mb-2 h-8">
          {project.texts.map((t) => {
            const sel = selection?.kind === "text" && selection.id === t.id;
            return (
              <div key={t.id} className={`group absolute top-0 flex h-full items-center gap-1 overflow-hidden rounded-md border px-2 text-xs ${sel ? "border-blue-400 bg-blue-100" : "border-neutral-300 bg-neutral-100"}`}
                style={{ left: t.start * pps, width: Math.max(16, (t.end - t.start) * pps) }}
                onPointerDown={(e) => textPointer(e, t.id, "move")}>
                <Type size={12} className="shrink-0" /><span className="truncate">{t.text}</span>
                <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize" onPointerDown={(e) => textPointer(e, t.id, "start")} />
                <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize" onPointerDown={(e) => textPointer(e, t.id, "end")} />
              </div>
            );
          })}
        </div>

        {/* Captions track */}
        {project.captions.enabled && (
          <div className="relative mb-2 h-5">
            {captions.map((c, i) => (
              <div key={i} className="absolute top-0 h-full truncate rounded bg-blue-50 px-1 text-[10px] leading-5 text-blue-900" style={{ left: c.start * pps, width: Math.max(2, (c.end - c.start) * pps - 1) }}>{c.text}</div>
            ))}
          </div>
        )}

        <Playhead time={time} pps={pps} />
      </div>
    </div>
  );
}

function Playhead({ time, pps }: { time: Store<number>; pps: number }) {
  const t = useStore(time);
  const x = t * pps + 12;
  const self = useRef<HTMLDivElement>(null);
  // Keeps the playhead in view while playing.
  useEffect(() => {
    const el = self.current?.closest<HTMLElement>(".overflow-x-auto");
    if (el && (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - 40)) el.scrollLeft = Math.max(0, x - el.clientWidth / 3);
  }, [x]);
  return (
    <div ref={self} className="pointer-events-none absolute inset-y-0 z-30 w-0.5 bg-blue-400" style={{ left: x }}>
      <div className="absolute -left-1.5 top-0 h-3 w-3.5 rounded-b bg-blue-400" />
    </div>
  );
}
