"use client";
import { useEffect, useRef } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { createClient } from "@/lib/supabase/client";

// Reports watch time every 10 seconds and when playback pauses or ends.
// The database decides what counts as a view (see record_view).
export function Player({ videoId, playbackId, title, portrait }: { videoId: string; playbackId: string; title: string; portrait: boolean }) {
  const session = useRef<string>("");
  const watched = useRef(0);
  const lastSent = useRef(0);
  const lastTime = useRef<number | null>(null);

  useEffect(() => {
    session.current = crypto.randomUUID();
    watched.current = 0;
    lastSent.current = 0;
  }, [videoId]);

  async function send(completed = false) {
    if (watched.current <= lastSent.current && !completed) return;
    lastSent.current = watched.current;
    await createClient().rpc("record_view", {
      p_video_id: videoId, p_session_id: session.current, p_watched_s: Math.round(watched.current * 10) / 10, p_completed: completed,
    });
  }

  function onTime(e: Event) {
    const t = (e.target as HTMLMediaElement).currentTime;
    // Count only real playback: small forward steps, not seeks.
    if (lastTime.current !== null && t > lastTime.current && t - lastTime.current < 2) watched.current += t - lastTime.current;
    lastTime.current = t;
    if (watched.current - lastSent.current >= 10) void send();
  }

  return (
    <MuxPlayer
      playbackId={playbackId}
      metadata={{ video_title: title, video_id: videoId }}
      streamType="on-demand"
      autoPlay
      playsInline
      onTimeUpdate={onTime}
      onSeeking={() => { lastTime.current = null; }}
      onPause={() => void send()}
      onEnded={() => void send(true)}
      style={{ width: "100%", height: "100%", aspectRatio: portrait ? "9 / 16" : "16 / 9", maxHeight: "100dvh" }}
    />
  );
}
