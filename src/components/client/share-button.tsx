"use client";
import { useState } from "react";

// Opens the phone's share sheet (Instagram, X, Messages…) or copies the link on desktop.
export function ShareButton({ path, title, className = "text-sm text-blue-600" }: { path: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = new URL(path, window.location.origin).toString();
    if (navigator.share) {
      try { await navigator.share({ title, url }); } catch { /* closed the sheet */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { window.prompt("Copy this link", url); }
  }
  return <button type="button" onClick={share} className={className}>{copied ? "Link copied" : "Share"}</button>;
}
