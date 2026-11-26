import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileFlags } from "@/lib/access";
import { AI_MODEL, aiEnabled, anthropic } from "@/lib/ai";
import { transcriptOf, transcriptText, type Cue } from "@/lib/transcript";

export const maxDuration = 120;

const requestSchema = z.object({
  videoId: z.uuid(),
  length: z.enum(["short", "medium", "long"]).default("short"),
  goal: z.string().trim().max(300).default(""),
});

const LENGTHS = { short: [15, 60], medium: [45, 180], long: [120, 600] } as const;

const suggestionSchema = z.object({
  clips: z.array(z.object({
    title: z.string().describe("Catchy clip title, under 80 characters"),
    start: z.number().describe("Start time in seconds"),
    end: z.number().describe("End time in seconds"),
    hook: z.string().describe("The first line a viewer hears, quoted from the transcript"),
    caption: z.string().describe("A short post to share the clip with followers, under 200 characters, 1-3 hashtags"),
    why: z.string().describe("One sentence on why this moment will perform well"),
    score: z.number().describe("Predicted viral potential from 1 to 100"),
  })),
});

// Simple per-instance limit so one creator can't run up the AI bill.
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 20) return false;
  recent.set(userId, [...hits, now]);
  return true;
}

// Keeps a suggestion inside the video and lines its edges up with sentence boundaries.
function snap(cues: Cue[], start: number, end: number, duration: number) {
  const s = cues.filter((c) => c.start <= start + 0.5).at(-1)?.start ?? start;
  const e = cues.find((c) => c.end >= end - 0.5)?.end ?? end;
  const clampedStart = Math.max(0, Math.min(s, duration - 1));
  const clampedEnd = Math.min(duration, Math.max(e, clampedStart + 1));
  return { start: Math.round(clampedStart * 10) / 10, end: Math.round(clampedEnd * 10) / 10 };
}

// Reads a video's transcript and asks Claude to pick the moments most worth clipping.
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await profileFlags(supabase, user.id)).betaAccess) {
    return NextResponse.json({ error: "AI clips are invite-only during the beta." }, { status: 403 });
  }
  if (!aiEnabled()) return NextResponse.json({ error: "AI clips aren't switched on yet. The site owner needs to add an AI key." }, { status: 503 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { videoId, length, goal } = parsed.data;

  const { data: v } = await createAdminClient().from("videos")
    .select("id, title, description, creator_id, status, mux_asset_id, mux_playback_id, duration_s")
    .eq("id", videoId).maybeSingle();
  if (!v || v.creator_id !== user.id) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  if (v.status !== "ready" || !v.mux_asset_id || !v.mux_playback_id) return NextResponse.json({ error: "That video is still processing." }, { status: 409 });
  if (!allow(user.id)) return NextResponse.json({ error: "You've used AI clips a lot this hour. Try again later." }, { status: 429 });

  const transcript = await transcriptOf(v.mux_asset_id, v.mux_playback_id);
  if (!transcript.ok) {
    const msg = {
      no_captions: "This video has no captions, so AI can't read it. Videos uploaded from now on get captions automatically.",
      captions_processing: "Captions are still being made for this video. Try again in a few minutes.",
      unavailable: "Couldn't read this video's captions. Try again.",
    }[transcript.reason];
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  const duration = Number(v.duration_s ?? transcript.cues.at(-1)?.end ?? 0);
  const [min, max] = LENGTHS[length];

  try {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(suggestionSchema) },
      system: "You are a senior short-form video editor. You find the moments in long videos that work as standalone clips: a strong hook in the first seconds, one clear idea or story, and a satisfying ending. Clips must start and end on complete sentences. Never invent words that are not in the transcript.",
      messages: [{
        role: "user",
        content: `Video title: ${v.title}\nDescription: ${(v.description ?? "").slice(0, 1000)}\nLength: ${Math.round(duration)} seconds\n${goal ? `Creator's goal: ${goal}\n` : ""}\nPick 3 to 6 of the best clips, each between ${min} and ${max} seconds long, that don't overlap. Order them best first. Use the timestamps in the transcript; times are in m:ss but answer in seconds.\n\n<transcript>\n${transcriptText(transcript.cues)}\n</transcript>`,
      }],
    });

    if (response.stop_reason === "refusal") return NextResponse.json({ error: "AI couldn't suggest clips for this video." }, { status: 422 });
    const clips = (response.parsed_output?.clips ?? [])
      .map((c) => ({ ...c, ...snap(transcript.cues, c.start, c.end, duration), score: Math.max(1, Math.min(100, Math.round(c.score))) }))
      .filter((c) => c.end - c.start >= 5 && c.end - c.start <= 600)
      .slice(0, 6);
    if (!clips.length) return NextResponse.json({ error: "AI didn't find clear standalone moments. Try a different length." }, { status: 422 });
    return NextResponse.json({ clips });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "AI is busy right now. Try again in a minute." }, { status: 429 });
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "The AI key isn't working. The site owner needs to check it." }, { status: 503 });
    return NextResponse.json({ error: "AI is unavailable right now. Try again." }, { status: 502 });
  }
}
