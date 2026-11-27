"use client";
import { useState } from "react";

// Shows a setting with a copy button. Secret values stay hidden until revealed.
export function SecretField({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setShown(true); }
  }
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-1 flex gap-2">
        <code className="flex-1 select-all overflow-x-auto rounded-lg bg-neutral-100 px-3 py-2 text-sm">{shown ? value : "•".repeat(24)}</code>
        {secret && <button type="button" onClick={() => setShown(!shown)} className="text-sm text-neutral-600">{shown ? "Hide" : "Show"}</button>}
        <button type="button" onClick={copy} className="text-sm text-blue-600">{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}
