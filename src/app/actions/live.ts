"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileFlags } from "@/lib/access";
import { mux, MAX_DURATION_S } from "@/lib/mux";

async function creator() {
  const { supabase, user } = await getUser();
  if (!user || !(await profileFlags(supabase, user.id)).betaAccess) throw new Error("Not allowed");
  return user;
}

// Creates the creator's live stream on Mux the first time they open Go Live.
export async function setupLiveStream() {
  const user = await creator();
  const admin = createAdminClient();
  const { data: existing } = await admin.from("live_streams").select("creator_id").eq("creator_id", user.id).maybeSingle();
  if (existing) return;
  const stream = await mux().video.liveStreams.create({
    playback_policies: ["public"],
    latency_mode: "low",
    reconnect_window: 60,
    // Just under the 30-minute video limit, so every replay fits.
    max_continuous_duration: MAX_DURATION_S - 15,
    passthrough: user.id,
    new_asset_settings: { playback_policies: ["public"], max_resolution_tier: "1080p" },
  });
  const playbackId = stream.playback_ids?.find((p) => p.policy === "public")?.id;
  if (!playbackId) throw new Error("Mux did not return a playback id");
  const { error } = await admin.from("live_streams").insert({
    creator_id: user.id, mux_live_stream_id: stream.id, mux_playback_id: playbackId,
  });
  // Lost a race with a second click: remove the extra stream.
  if (error) await mux().video.liveStreams.delete(stream.id).catch(() => undefined);
  revalidatePath("/studio/live");
}

export async function updateLiveTitle(formData: FormData) {
  const user = await creator();
  const title = z.string().trim().max(120).parse(formData.get("title") ?? "");
  await createAdminClient().from("live_streams").update({ title, updated_at: new Date().toISOString() }).eq("creator_id", user.id);
  revalidatePath("/studio/live");
}

// Makes a new stream key, e.g. if the old one was shared by mistake.
export async function resetStreamKey() {
  const user = await creator();
  const { data } = await createAdminClient().from("live_streams").select("mux_live_stream_id").eq("creator_id", user.id).maybeSingle();
  if (data) await mux().video.liveStreams.resetStreamKey(data.mux_live_stream_id);
  revalidatePath("/studio/live");
}
