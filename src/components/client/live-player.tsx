"use client";
import MuxPlayer from "@mux/mux-player-react";

export function LivePlayer({ playbackId, title }: { playbackId: string; title: string }) {
  return (
    <MuxPlayer playbackId={playbackId} streamType="ll-live" autoPlay="muted" playsInline
      metadata={{ video_title: title }} style={{ width: "100%", aspectRatio: "16 / 9" }} />
  );
}
