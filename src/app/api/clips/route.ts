import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileFlags } from "@/lib/access";
import { mux } from "@/lib/mux";
import { newClipSchema } from "@/lib/validation";

const CLIPS_PER_HOUR = 30;

// Cuts a clip (or a trimmed version) from one of the creator's own videos.
// Mux copies the chosen time range into a new video; the clip links back to its source.
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await profileFlags(supabase, user.id)).betaAccess) {
    return NextResponse.json({ error: "Publishing is invite-only during the beta. Enter your invite code first." }, { status: 403 });
  }

  const parsed = newClipSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid clip." }, { status: 400 });
  const input = parsed.data;
  const admin = createAdminClient();

  const { data: source } = await admin.from("videos")
    .select("id, creator_id, status, mux_asset_id, duration_s, topic_id, visibility")
    .eq("id", input.sourceVideoId).maybeSingle();
  if (!source || source.creator_id !== user.id) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  if (source.status !== "ready" || !source.mux_asset_id) return NextResponse.json({ error: "That video is still processing." }, { status: 409 });
  if (source.duration_s && input.end > Number(source.duration_s) + 0.5) {
    return NextResponse.json({ error: "The clip ends after the video does." }, { status: 400 });
  }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from("videos").select("id", { count: "exact", head: true })
    .eq("creator_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= CLIPS_PER_HOUR) return NextResponse.json({ error: "Limit reached. Try again in an hour." }, { status: 429 });

  const { data: clip, error } = await admin.from("videos").insert({
    creator_id: user.id, title: input.title, source_video_id: source.id, topic_id: input.topicId ?? source.topic_id,
    visibility: source.visibility, rights_confirmed: true, status: "processing",
  }).select("id").single();
  if (error || !clip) return NextResponse.json({ error: "Could not create the clip." }, { status: 500 });

  try {
    const asset = await mux().video.assets.create({
      inputs: [{ url: `mux://assets/${source.mux_asset_id}`, start_time: input.start, end_time: input.end }],
      playback_policies: ["public"],
      max_resolution_tier: "1080p",
      passthrough: clip.id,
    });
    await admin.from("videos").update({ mux_asset_id: asset.id }).eq("id", clip.id);
    if (input.postText) {
      await admin.from("studio_projects").insert({
        creator_id: user.id, title: input.title, origin: "desktop",
        edit_list: { version: 1, clips: [{ source: source.id, start: input.start, end: input.end }], postText: input.postText },
        output_video_id: clip.id,
      });
    }
    return NextResponse.json({ videoId: clip.id }, { status: 201 });
  } catch {
    await admin.from("videos").update({ status: "failed" }).eq("id", clip.id);
    return NextResponse.json({ error: "Video service is unavailable. Try again." }, { status: 502 });
  }
}
