// The Cast editor's project format and the pure edits on it.
// Everything here is plain data and plain functions, so it runs the same in the
// browser, on the server, and in tests.
import { z } from "zod";

export const ASPECTS = {
  "9:16": { w: 1080, h: 1920, label: "Vertical 9:16", hint: "Shorts, Reels, TikTok" },
  "16:9": { w: 1920, h: 1080, label: "Wide 16:9", hint: "YouTube, desktop" },
  "1:1": { w: 1080, h: 1080, label: "Square 1:1", hint: "Feeds" },
  "4:5": { w: 1080, h: 1350, label: "Portrait 4:5", hint: "Instagram feed" },
} as const;
export type Aspect = keyof typeof ASPECTS;

export const CAPTION_STYLES = {
  bold: { label: "Bold pop", font: "800", color: "#ffffff", stroke: "#000000", box: null, highlight: "#34f5c5", upper: true },
  clean: { label: "Clean", font: "600", color: "#ffffff", stroke: null, box: "rgba(0,0,0,0.55)", highlight: null, upper: false },
  karaoke: { label: "Karaoke", font: "800", color: "#ffffff", stroke: "#000000", box: null, highlight: "#facc15", upper: false },
  minimal: { label: "Minimal", font: "500", color: "#f3f4f6", stroke: null, box: null, highlight: null, upper: false },
} as const;
export type CaptionStyle = keyof typeof CAPTION_STYLES;

export const TEXT_STYLES = {
  title: { label: "Title", weight: "800", size: 0.075, color: "#ffffff", box: null },
  subtitle: { label: "Subtitle", weight: "600", size: 0.045, color: "#ffffff", box: null },
  label: { label: "Label", weight: "700", size: 0.04, color: "#07080a", box: "#34f5c5" },
  quote: { label: "Quote", weight: "500", size: 0.05, color: "#ffffff", box: "rgba(0,0,0,0.6)" },
} as const;
export type TextStyle = keyof typeof TEXT_STYLES;

const id = z.string().min(1).max(40);

export const clipSchema = z.object({
  id,
  source: z.uuid(),          // a video in the creator's library
  in: z.number().min(0),     // seconds into the source
  out: z.number().min(0),
  speed: z.number().min(0.25).max(4).default(1),
  volume: z.number().min(0).max(2).default(1),
  fit: z.enum(["fill", "fit"]).default("fill"),
  zoom: z.number().min(1).max(3).default(1),
  panX: z.number().min(-1).max(1).default(0),
  panY: z.number().min(-1).max(1).default(0),
});
export type Clip = z.infer<typeof clipSchema>;

export const textSchema = z.object({
  id,
  text: z.string().max(200),
  start: z.number().min(0),  // seconds on the timeline
  end: z.number().min(0),
  style: z.enum(Object.keys(TEXT_STYLES) as [TextStyle, ...TextStyle[]]).default("title"),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.2),
  color: z.string().max(30).optional(),
  animation: z.enum(["none", "fade", "pop", "slide"]).default("pop"),
});
export type TextItem = z.infer<typeof textSchema>;

export const cueSchema = z.object({ start: z.number(), end: z.number(), text: z.string().max(500) });

export const projectSchema = z.object({
  version: z.literal(2),
  aspect: z.enum(Object.keys(ASPECTS) as [Aspect, ...Aspect[]]).default("9:16"),
  background: z.enum(["blur", "black"]).default("blur"),
  clips: z.array(clipSchema).max(200).default([]),
  texts: z.array(textSchema).max(100).default([]),
  captions: z.object({
    enabled: z.boolean().default(false),
    style: z.enum(Object.keys(CAPTION_STYLES) as [CaptionStyle, ...CaptionStyle[]]).default("bold"),
    y: z.number().min(0).max(1).default(0.72),
  }).default({ enabled: false, style: "bold", y: 0.72 }),
  postText: z.string().max(1000).default(""),
});
export type Project = z.infer<typeof projectSchema>;

export function emptyProject(aspect: Aspect = "9:16"): Project {
  return { version: 2, aspect, background: "blur", clips: [], texts: [], captions: { enabled: false, style: "bold", y: 0.72 }, postText: "" };
}

// Older saved projects (version 1, from the clip tool) become version 2.
export function loadProject(raw: unknown): Project {
  const v2 = projectSchema.safeParse(raw);
  if (v2.success) return v2.data;
  const p = emptyProject();
  const v1 = raw as { clips?: { source: string; start: number; end: number }[]; postText?: string } | null;
  for (const c of v1?.clips ?? []) {
    const clip = clipSchema.safeParse({ id: newId(), source: c.source, in: c.start, out: c.end });
    if (clip.success) p.clips.push(clip.data);
  }
  p.postText = typeof v1?.postText === "string" ? v1.postText.slice(0, 1000) : "";
  return p;
}

let counter = 0;
export function newId() {
  counter = (counter + 1) % 1e6;
  return `${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const MIN_CLIP = 0.2;
export const MAX_EXPORT_S = 10 * 60;

// Seconds a clip takes up on the timeline (speed changes it).
export const clipLength = (c: Clip) => Math.max(0, (c.out - c.in) / c.speed);
export const totalLength = (p: Project) => p.clips.reduce((t, c) => t + clipLength(c), 0);

// Where each clip starts on the timeline.
export function clipStarts(p: Project) {
  let t = 0;
  return p.clips.map((c) => { const s = t; t += clipLength(c); return s; });
}

// Finds which clip plays at a timeline time, and the matching time in its source.
export function locate(p: Project, t: number): { index: number; clip: Clip; offset: number; sourceTime: number } | null {
  let start = 0;
  for (let i = 0; i < p.clips.length; i++) {
    const c = p.clips[i];
    const len = clipLength(c);
    if (t < start + len || i === p.clips.length - 1) {
      const offset = Math.max(0, Math.min(len, t - start));
      return { index: i, clip: c, offset, sourceTime: c.in + offset * c.speed };
    }
    start += len;
  }
  return null;
}

export function addClip(p: Project, clip: Omit<Clip, "id" | "speed" | "volume" | "fit" | "zoom" | "panX" | "panY"> & Partial<Clip>, at?: number): Project {
  const full = clipSchema.parse({ id: newId(), ...clip });
  const clips = [...p.clips];
  clips.splice(at ?? clips.length, 0, full);
  return { ...p, clips };
}

// Cuts the clip under the playhead into two at that point.
export function splitAt(p: Project, t: number): Project {
  const hit = locate(p, t);
  if (!hit) return p;
  const { index, clip, sourceTime } = hit;
  if (sourceTime - clip.in < MIN_CLIP || clip.out - sourceTime < MIN_CLIP) return p;
  const a = { ...clip, out: sourceTime };
  const b = { ...clip, id: newId(), in: sourceTime };
  const clips = [...p.clips];
  clips.splice(index, 1, a, b);
  return { ...p, clips };
}

export function removeClip(p: Project, clipId: string): Project {
  return { ...p, clips: p.clips.filter((c) => c.id !== clipId) };
}

export function moveClip(p: Project, from: number, to: number): Project {
  if (from === to || from < 0 || from >= p.clips.length) return p;
  const clips = [...p.clips];
  const [c] = clips.splice(from, 1);
  clips.splice(Math.max(0, Math.min(clips.length, to)), 0, c);
  return { ...p, clips };
}

export function duplicateClip(p: Project, clipId: string): Project {
  const i = p.clips.findIndex((c) => c.id === clipId);
  if (i < 0) return p;
  const clips = [...p.clips];
  clips.splice(i + 1, 0, { ...p.clips[i], id: newId() });
  return { ...p, clips };
}

// Trims one edge of a clip, keeping it inside its source video.
export function trimClip(p: Project, clipId: string, edge: "in" | "out", value: number, sourceDuration: number): Project {
  return {
    ...p,
    clips: p.clips.map((c) => {
      if (c.id !== clipId) return c;
      if (edge === "in") return { ...c, in: Math.max(0, Math.min(value, c.out - MIN_CLIP)) };
      return { ...c, out: Math.min(sourceDuration || Infinity, Math.max(value, c.in + MIN_CLIP)) };
    }),
  };
}

export function updateClip(p: Project, clipId: string, patch: Partial<Clip>): Project {
  return { ...p, clips: p.clips.map((c) => (c.id === clipId ? clipSchema.parse({ ...c, ...patch }) : c)) };
}

export function addText(p: Project, t: number, text = "Your text", style: TextStyle = "title"): Project {
  const item = textSchema.parse({ id: newId(), text, start: t, end: t + 3, style });
  return { ...p, texts: [...p.texts, item] };
}

export function updateText(p: Project, textId: string, patch: Partial<TextItem>): Project {
  return { ...p, texts: p.texts.map((x) => (x.id === textId ? textSchema.parse({ ...x, ...patch }) : x)) };
}

export function removeText(p: Project, textId: string): Project {
  return { ...p, texts: p.texts.filter((x) => x.id !== textId) };
}

export type Cue = z.infer<typeof cueSchema>;

// Lays each clip's captions onto the timeline, so captions follow every cut.
export function timelineCaptions(p: Project, cuesBySource: Record<string, Cue[] | undefined>): Cue[] {
  const out: Cue[] = [];
  const starts = clipStarts(p);
  p.clips.forEach((c, i) => {
    for (const cue of cuesBySource[c.source] ?? []) {
      const s = Math.max(cue.start, c.in);
      const e = Math.min(cue.end, c.out);
      if (e - s < 0.05) continue;
      out.push({ start: starts[i] + (s - c.in) / c.speed, end: starts[i] + (e - c.in) / c.speed, text: cue.text });
    }
  });
  return out;
}

// AI "remove silences": keeps only the parts of each clip where someone is talking.
// Gaps between lines of speech longer than `minGap` are cut out; `pad` keeps a little air.
export function removeSilences(p: Project, cuesBySource: Record<string, Cue[] | undefined>, minGap = 0.6, pad = 0.12): { project: Project; removed: number } {
  let removed = 0;
  const clips: Clip[] = [];
  for (const c of p.clips) {
    const cues = (cuesBySource[c.source] ?? []).filter((q) => q.end > c.in && q.start < c.out).sort((a, b) => a.start - b.start);
    if (!cues.length) { clips.push(c); continue; }
    const spans: [number, number][] = [];
    for (const q of cues) {
      const s = Math.max(c.in, q.start - pad);
      const e = Math.min(c.out, q.end + pad);
      const last = spans.at(-1);
      if (last && s - last[1] < minGap) last[1] = Math.max(last[1], e);
      else spans.push([s, e]);
    }
    const kept = spans.reduce((t, [s, e]) => t + (e - s), 0);
    removed += (c.out - c.in - kept) / c.speed;
    spans.forEach(([s, e], k) => clips.push({ ...c, id: k === 0 ? c.id : newId(), in: s, out: e }));
  }
  return { project: { ...p, clips }, removed };
}

// Undo/redo history for the editor.
export type History = { past: Project[]; present: Project; future: Project[] };
export const startHistory = (p: Project): History => ({ past: [], present: p, future: [] });
export function commit(h: History, next: Project): History {
  if (next === h.present) return h;
  return { past: [...h.past.slice(-99), h.present], present: next, future: [] };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}
