import { Suspense } from "react";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { compact, duration } from "@/lib/format";

export default function LibraryPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Library</h1>
        <Link href="/studio" className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white">Upload</Link>
      </div>
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}><List /></Suspense>
    </div>
  );
}

const statusLabel: Record<string, string> = { uploading: "Uploading", processing: "Processing", ready: "Live", failed: "Failed" };

async function List() {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data } = await supabase.from("videos")
    .select("id, title, status, duration_s, view_count, visibility, created_at")
    .eq("creator_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (!data?.length) return <p className="text-neutral-500">No videos yet.</p>;
  return (
    <ul className="divide-y divide-neutral-200">
      {data.map((v) => (
        <li key={v.id} className="flex items-center justify-between py-3">
          <Link href={`/v/${v.id}`} className="min-w-0">
            <p className="truncate font-medium">{v.title || "Untitled"}</p>
            <p className="text-sm text-neutral-500">{duration(v.duration_s)} · {compact(v.view_count)} views · {v.visibility}</p>
          </Link>
          <span className={`rounded-full px-2 py-0.5 text-xs ${v.status === "ready" ? "bg-green-100 text-green-800" : v.status === "failed" ? "bg-red-100 text-red-800" : "bg-neutral-100"}`}>
            {statusLabel[v.status]}
          </span>
        </li>
      ))}
    </ul>
  );
}
