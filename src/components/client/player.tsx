"use client";
import MuxPlayer from "@mux/mux-player-react";

export function Player({ playbackId, title, portrait }: { playbackId: string; title: string; portrait: boolean }) {
  return (
    <MuxPlayer
      playbackId={playbackId}
      metadata={{ video_title: title }}
      streamType="on-demand"
      autoPlay
      playsInline
      style={{ width: "100%", height: "100%", aspectRatio: portrait ? "9 / 16" : "16 / 9", maxHeight: "100dvh" }}
    />
  );
}
