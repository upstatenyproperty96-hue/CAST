import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileFlags } from "@/lib/access";
import { autoCaptions, mux } from "@/lib/mux";
import { publicEnv } from "@/lib/env";
import { newUploadSchema } from "@/lib/validation";

const UPLOADS_PER_HOUR = 20;

// Starts an upload: creates the video record and a one-time Mux upload URL.
// The browser or phone then sends the file straight to Mux, never through our server.
export async function POST(request: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to upload." }, { status: 401 });
  if (!(await profileFlags(supabase, user.id)).betaAccess) {
    return NextResponse.json({ error: "Publishing is invite-only during the beta. Enter your invite code first." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = newUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload." }, { status: 400 });
  }
  const input = parsed.data;
  const admin = createAdminClient();

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("videos")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= UPLOADS_PER_HOUR) {
    return NextResponse.json({ error: "Upload limit reached. Try again in an hour." }, { status: 429 });
  }

  if (input.sourceVideoId) {
    const { data: source } = await admin
      .from("videos").select("creator_id").eq("id", input.sourceVideoId).maybeSingle();
    if (!source || source.creator_id !== user.id) {
      return NextResponse.json({ error: "Clips can only link to your own videos." }, { status: 400 });
    }
  }

  const { data: video, error } = await admin
    .from("videos")
    .insert({
      creator_id: user.id,
      title: input.title,
      description: input.description,
      visibility: input.visibility,
      topic_id: input.topicId,
      source_video_id: input.sourceVideoId,
      published_at: input.publishAt,
      rights_confirmed: true,
      status: "uploading",
    })
    .select("id")
    .single();
  if (error || !video) return NextResponse.json({ error: "Could not start upload." }, { status: 500 });

  try {
    const upload = await mux().video.uploads.create({
      cors_origin: publicEnv.NEXT_PUBLIC_SITE_URL,
      timeout: 3600,
      new_asset_settings: {
        playback_policies: ["public"],
        max_resolution_tier: "1080p",
        // No url: the uploaded file is the input. Captions are generated from its audio.
        inputs: [{ generated_subtitles: autoCaptions(input.captionLanguage) }],
        passthrough: video.id,
        meta: { title: input.title, creator_id: user.id },
      },
    });
    await admin.from("videos").update({ mux_upload_id: upload.id }).eq("id", video.id);
    if (input.postText) {
      // Saved now, posted when the video is ready (see the Mux webhook).
      await admin.from("studio_projects").insert({
        creator_id: user.id, title: input.title, origin: "desktop",
        edit_list: { version: 1, clips: [], postText: input.postText }, output_video_id: video.id,
      });
    }
    return NextResponse.json({ videoId: video.id, uploadUrl: upload.url }, { status: 201 });
  } catch {
    await admin.from("videos").update({ status: "failed" }).eq("id", video.id);
    return NextResponse.json({ error: "Video service is unavailable. Try again." }, { status: 502 });
  }
}
