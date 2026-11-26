import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { transcriptOf } from "@/lib/transcript";

// Timed captions for one of the creator's own videos, for on-screen captions and silence cuts.
export async function GET(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const id = z.uuid().safeParse(request.nextUrl.searchParams.get("videoId"));
  if (!id.success) return NextResponse.json({ error: "Invalid video." }, { status: 400 });
  const { data: v } = await supabase.from("videos").select("creator_id, mux_asset_id, mux_playback_id").eq("id", id.data).maybeSingle();
  if (!v || v.creator_id !== user.id || !v.mux_asset_id || !v.mux_playback_id) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  const t = await transcriptOf(v.mux_asset_id, v.mux_playback_id);
  if (!t.ok) return NextResponse.json({ cues: [], reason: t.reason });
  return NextResponse.json({ cues: t.cues }, { headers: { "cache-control": "private, max-age=300" } });
}
