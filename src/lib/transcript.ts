import "server-only";
import { mux } from "@/lib/mux";

export type Cue = { start: number; end: number; text: string };

const toSeconds = (t: string) => {
  const parts = t.trim().split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};

// Turns a WebVTT caption file into timed lines of speech.
export function parseVtt(vtt: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const text = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) cues.push({ start: toSeconds(a), end: toSeconds(b.trim().split(/\s/)[0]), text });
  }
  return cues;
}

export type TranscriptResult =
  | { ok: true; cues: Cue[] }
  | { ok: false; reason: "no_captions" | "captions_processing" | "unavailable" };

// Reads the auto captions Mux made for a video, so AI can find its best moments.
export async function transcriptOf(assetId: string, playbackId: string): Promise<TranscriptResult> {
  try {
    const asset = await mux().video.assets.retrieve(assetId);
    const tracks = (asset.tracks ?? []).filter((t) => t.type === "text");
    const track = tracks.find((t) => t.status === "ready") ?? tracks[0];
    if (!track?.id) return { ok: false, reason: "no_captions" };
    if (track.status !== "ready") return { ok: false, reason: "captions_processing" };
    const res = await fetch(`https://stream.mux.com/${encodeURIComponent(playbackId)}/text/${encodeURIComponent(track.id)}.vtt`, { cache: "no-store" });
    if (!res.ok) return { ok: false, reason: "unavailable" };
    const cues = parseVtt(await res.text());
    return cues.length ? { ok: true, cues } : { ok: false, reason: "no_captions" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

// Compact "[m:ss] words" lines; this is what the AI reads.
export function transcriptText(cues: Cue[]) {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return cues.map((c) => `[${fmt(c.start)}-${fmt(c.end)}] ${c.text}`).join("\n");
}
