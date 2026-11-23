import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mux, MAX_DURATION_S } from "@/lib/mux";

// Mux calls this when an upload becomes an asset, finishes processing, or fails.
// The signature check proves the request really came from Mux.
export async function POST(request: NextRequest) {
  if (!process.env.MUX_WEBHOOK_SECRET) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  const raw = await request.text();
  let event;
  try {
    event = await mux().webhooks.unwrap(raw, request.headers);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case "video.asset.created": {
      const videoId = event.data.passthrough;
      if (videoId) await admin.from("videos").update({ mux_asset_id: event.data.id, status: "processing" }).eq("id", videoId);
      break;
    }
    case "video.asset.ready": {
      const asset = event.data;
      const videoId = asset.passthrough;
      if (!videoId) break;
      const duration = asset.duration ?? 0;
      if (duration > MAX_DURATION_S) {
        await mux().video.assets.delete(asset.id).catch(() => undefined);
        await admin.from("videos").update({ status: "failed" }).eq("id", videoId);
        break;
      }
      const [w, h] = (asset.aspect_ratio ?? "16:9").split(":").map(Number);
      const aspect = w === h ? "square" : w > h ? "landscape" : "portrait";
      const playbackId = asset.playback_ids?.find((p) => p.policy === "public")?.id ?? null;

      const { data: video } = await admin.from("videos").select("id, creator_id, published_at").eq("id", videoId).maybeSingle();
      if (!video) break;
      await admin.from("videos").update({
        status: "ready",
        mux_asset_id: asset.id,
        mux_playback_id: playbackId,
        duration_s: duration,
        aspect,
        published_at: video.published_at ?? new Date().toISOString(),
      }).eq("id", videoId);

      // One feed post per video (safe if Mux retries the webhook).
      const { data: existing } = await admin.from("posts").select("id").eq("video_id", videoId).limit(1);
      if (!existing?.length) {
        const { data: project } = await admin.from("studio_projects").select("edit_list").eq("output_video_id", videoId).maybeSingle();
        const postText = (project?.edit_list as { postText?: string } | null)?.postText ?? "";
        await admin.from("posts").insert({ author_id: video.creator_id, body: postText, video_id: videoId });
        await admin.from("profiles").update({ is_creator: true }).eq("id", video.creator_id);
      }
      break;
    }
    case "video.asset.errored":
    case "video.upload.errored":
    case "video.upload.cancelled": {
      const passthrough = "passthrough" in event.data ? event.data.passthrough : undefined;
      const uploadVideo = "new_asset_settings" in event.data ? event.data.new_asset_settings?.passthrough : undefined;
      const videoId = passthrough ?? uploadVideo;
      if (videoId) await admin.from("videos").update({ status: "failed" }).eq("id", videoId);
      break;
    }
  }
  return NextResponse.json({ received: true });
}
