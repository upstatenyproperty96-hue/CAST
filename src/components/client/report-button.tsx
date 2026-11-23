"use client";
import { useState } from "react";
import { report } from "@/app/actions/social";

const reasons = ["Spam", "Harassment or hate", "Nudity or sexual content", "Violence", "Stolen content (copyright)", "Other"];

export function ReportButton({ target, targetId, className = "" }: { target: "post" | "user" | "comment"; targetId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  if (done) return <span className={className}>Reported. Thanks.</span>;
  if (!open) return <button className={className} onClick={() => setOpen(true)}>Report</button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={async (fd) => { const r = await report(fd); setDone(r.ok); setOpen(r.ok ? false : true); }}
    >
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="targetId" value={targetId} />
      <select name="reason" className="rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900">
        {reasons.map((r) => <option key={r}>{r}</option>)}
      </select>
      <button className="rounded bg-red-600 px-2 py-1 text-sm text-white">Send</button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm">Cancel</button>
    </form>
  );
}
