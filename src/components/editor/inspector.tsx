"use client";
import { Copy, Scissors, Trash2 } from "lucide-react";
import { TEXT_STYLES, clipLength, duplicateClip, removeClip, removeText, updateClip, updateText, type Project, type TextStyle } from "@/lib/editor/model";
import type { SourceInfo } from "./engine";
import type { Selection } from "./timeline";
import { fmtTime } from "./store";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const COLORS = ["#ffffff", "#34f5c5", "#facc15", "#f91880", "#60a5fa", "#07080a"];
const icon = "flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1.5 text-xs font-medium transition hover:border-blue-500";

export function Inspector({ project, sources, selection, apply, onSplit, onSelect }: {
  project: Project;
  sources: Record<string, SourceInfo>;
  selection: Selection;
  apply: (p: Project) => void;
  onSplit: () => void;
  onSelect: (s: Selection) => void;
}) {
  if (selection?.kind === "clip") {
    const c = project.clips.find((x) => x.id === selection.id);
    if (!c) return null;
    const set = (patch: Parameters<typeof updateClip>[2]) => apply(updateClip(project, c.id, patch));
    return (
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <p className="truncate font-semibold">{sources[c.source]?.title ?? "Clip"}</p>
          <p className="text-xs text-neutral-500">{fmtTime(c.in, true)} to {fmtTime(c.out, true)} of the original · {fmtTime(clipLength(c), true)} on timeline</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={icon} onClick={onSplit} title="Split at playhead (S)"><Scissors size={14} /> Split</button>
          <button className={icon} onClick={() => apply(duplicateClip(project, c.id))} title="Duplicate (D)"><Copy size={14} /> Duplicate</button>
          <button className={`${icon} hover:!border-red-600 hover:text-red-600`} onClick={() => { apply(removeClip(project, c.id)); onSelect(null); }} title="Delete"><Trash2 size={14} /> Delete</button>
        </div>
        <div>
          <p className="mb-1 text-xs text-neutral-500">Speed</p>
          <div className="flex flex-wrap gap-1">
            {SPEEDS.map((s) => (
              <button key={s} onClick={() => set({ speed: s })} className={`rounded-full px-2.5 py-1 text-xs ${c.speed === s ? "bg-blue-500 text-white" : "bg-neutral-100"}`}>{s}×</button>
            ))}
          </div>
        </div>
        <label className="text-xs text-neutral-500">Volume {Math.round(c.volume * 100)}%
          <input type="range" min={0} max={2} step={0.05} value={c.volume} onChange={(e) => set({ volume: Number(e.target.value) })} className="w-full" />
        </label>
        <div className="flex gap-1 rounded-full bg-neutral-100 p-1 text-xs">
          {(["fill", "fit"] as const).map((f) => (
            <button key={f} onClick={() => set({ fit: f })} className={`flex-1 rounded-full py-1.5 ${c.fit === f ? "bg-neutral-300 font-semibold" : ""}`}>{f === "fill" ? "Fill frame" : "Fit whole video"}</button>
          ))}
        </div>
        <label className="text-xs text-neutral-500">Zoom {c.zoom.toFixed(2)}×
          <input type="range" min={1} max={3} step={0.01} value={c.zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} className="w-full" />
        </label>
        <label className="text-xs text-neutral-500">Move left / right
          <input type="range" min={-1} max={1} step={0.01} value={c.panX} onChange={(e) => set({ panX: Number(e.target.value) })} className="w-full" />
        </label>
        <label className="text-xs text-neutral-500">Move up / down
          <input type="range" min={-1} max={1} step={0.01} value={c.panY} onChange={(e) => set({ panY: Number(e.target.value) })} className="w-full" />
        </label>
      </div>
    );
  }

  if (selection?.kind === "text") {
    const t = project.texts.find((x) => x.id === selection.id);
    if (!t) return null;
    const set = (patch: Parameters<typeof updateText>[2]) => apply(updateText(project, t.id, patch));
    return (
      <div className="flex flex-col gap-3 text-sm">
        <textarea value={t.text} maxLength={200} rows={3} onChange={(e) => set({ text: e.target.value })} className="rounded-xl border border-neutral-300 px-3 py-2" />
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(TEXT_STYLES) as TextStyle[]).map((k) => (
            <button key={k} onClick={() => set({ style: k })} className={`rounded-lg px-2 py-1.5 text-xs ${t.style === k ? "bg-blue-500 text-white" : "bg-neutral-100"}`}>{TEXT_STYLES[k].label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {COLORS.map((col) => (
            <button key={col} aria-label={`Color ${col}`} onClick={() => set({ color: col })} className={`h-7 w-7 rounded-full border-2 ${(t.color ?? TEXT_STYLES[t.style].color) === col ? "border-blue-400" : "border-neutral-300"}`} style={{ background: col }} />
          ))}
        </div>
        <div>
          <p className="mb-1 text-xs text-neutral-500">Entrance</p>
          <div className="flex gap-1">
            {(["pop", "fade", "slide", "none"] as const).map((a) => (
              <button key={a} onClick={() => set({ animation: a })} className={`flex-1 rounded-full py-1 text-xs capitalize ${t.animation === a ? "bg-blue-500 text-white" : "bg-neutral-100"}`}>{a}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-500">On screen {fmtTime(t.start, true)} to {fmtTime(t.end, true)}. Drag its block on the timeline to change when it shows.</p>
        <button className={`${icon} self-start hover:!border-red-600 hover:text-red-600`} onClick={() => { apply(removeText(project, t.id)); onSelect(null); }}><Trash2 size={14} /> Delete text</button>
      </div>
    );
  }

  return (
    <div className="text-sm text-neutral-500">
      <p className="mb-2 font-medium text-neutral-700">Shortcuts</p>
      <ul className="flex flex-col gap-1 text-xs">
        <li><kbd>Space</kbd> play / pause</li>
        <li><kbd>S</kbd> split at playhead</li>
        <li><kbd>D</kbd> duplicate selected</li>
        <li><kbd>Delete</kbd> remove selected</li>
        <li><kbd>←</kbd> <kbd>→</kbd> step a frame (hold Shift for 1s)</li>
        <li><kbd>Ctrl/⌘ Z</kbd> undo, <kbd>Shift</kbd> to redo</li>
        <li><kbd>+</kbd> <kbd>−</kbd> zoom the timeline</li>
      </ul>
    </div>
  );
}
