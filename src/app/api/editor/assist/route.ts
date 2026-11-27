import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getUser } from "@/lib/supabase/server";
import { AI_MODEL, aiEnabled, anthropic } from "@/lib/ai";

export const maxDuration = 60;

const requestSchema = z.object({
  transcript: z.string().max(60_000),
  title: z.string().max(120).default(""),
  tone: z.enum(["hype", "friendly", "professional", "funny"]).default("friendly"),
});

const resultSchema = z.object({
  title: z.string().describe("Video title, under 80 characters"),
  postText: z.string().describe("Post to share the video with followers, under 280 characters, with 1-3 relevant hashtags"),
  hook: z.string().describe("Short on-screen hook shown in the first seconds, 2 to 7 words"),
  hashtags: z.array(z.string()).describe("3 to 6 hashtags without the # sign"),
});

const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const hits = (recent.get(userId) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 40) return false;
  recent.set(userId, [...hits, now]);
  return true;
}

// Writes a title, a post and an on-screen hook for the edit, from what is said in it.
export async function POST(request: NextRequest) {
  const { user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!aiEnabled()) return NextResponse.json({ error: "AI tools aren't switched on yet. The site owner needs to add an AI key." }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (!allow(user.id)) return NextResponse.json({ error: "You've used AI a lot this hour. Try again later." }, { status: 429 });
  const { transcript, title, tone } = parsed.data;
  if (transcript.trim().length < 20) return NextResponse.json({ error: "There isn't enough speech in this edit for AI to write about. Add captions first." }, { status: 422 });

  try {
    const res = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(resultSchema) },
      system: "You write packaging for creator videos on Cast, a social video platform: titles, posts and on-screen hooks that earn clicks honestly. Match the requested tone. Never promise anything the video doesn't contain.",
      messages: [{ role: "user", content: `Tone: ${tone}\n${title ? `Working title: ${title}\n` : ""}\n<transcript>\n${transcript}\n</transcript>` }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return NextResponse.json({ error: "AI couldn't write for this video." }, { status: 422 });
    return NextResponse.json(res.parsed_output);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "AI is busy right now. Try again in a minute." }, { status: 429 });
    return NextResponse.json({ error: "AI is unavailable right now. Try again." }, { status: 502 });
  }
}
