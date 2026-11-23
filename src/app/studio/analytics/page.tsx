import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { compact, dayAgo } from "@/lib/format";
import { StudioNav } from "@/components/studio-nav";

const ranges = [7, 28, 90] as const;

export default function AnalyticsPage(props: PageProps<"/studio/analytics">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      <StudioNav active="/studio/analytics" />
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}><Inner {...props} /></Suspense>
    </div>
  );
}

async function Inner({ searchParams }: PageProps<"/studio/analytics">) {
  const sp = await searchParams;
  const days = ranges.find((r) => String(r) === sp.days) ?? 28;
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/studio/analytics");

  const since = dayAgo(days);
  const [{ data: videos }, { data: profile }, { count: newFollowers }] = await Promise.all([
    supabase.from("videos").select("id, title").eq("creator_id", user.id).eq("status", "ready"),
    supabase.from("profiles").select("follower_count").eq("id", user.id).single(),
    supabase.from("follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", user.id).gte("created_at", since),
  ]);
  const ids = (videos ?? []).map((v) => v.id);
  const { data: stats } = ids.length
    ? await supabase.from("video_stats_daily").select("video_id, day, views, watch_time_s").in("video_id", ids).gte("day", since)
    : { data: [] as { video_id: string; day: string; views: number; watch_time_s: number }[] };

  const rows = stats ?? [];
  const views = rows.reduce((a, r) => a + r.views, 0);
  const hours = rows.reduce((a, r) => a + Number(r.watch_time_s), 0) / 3600;
  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) byDay.set(dayAgo(i), 0);
  rows.forEach((r) => byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.views));
  const series = [...byDay.entries()];
  const max = Math.max(1, ...series.map(([, v]) => v));
  const byVideo = new Map<string, number>();
  rows.forEach((r) => byVideo.set(r.video_id, (byVideo.get(r.video_id) ?? 0) + r.views));
  const top = (videos ?? []).map((v) => ({ ...v, views: byVideo.get(v.id) ?? 0 })).sort((a, b) => b.views - a.views).slice(0, 5);
  const topMax = Math.max(1, ...top.map((t) => t.views));

  const W = 600, H = 140;
  const pts = series.map(([, v], i) => `${(i / Math.max(1, series.length - 1)) * W},${H - (v / max) * (H - 10)}`).join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Analytics</h1>
        <div className="flex gap-1 text-sm">
          {ranges.map((r) => (
            <Link key={r} href={`/studio/analytics?days=${r}`} className={`rounded-full px-3 py-1 ${r === days ? "bg-blue-600 text-white" : "bg-neutral-100"}`}>{r} days</Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[["Views", compact(views)], ["Watch time", `${compact(Math.round(hours))} hrs`], ["New followers", `+${compact(newFollowers ?? 0)}`]].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-neutral-200 p-4">
            <p className="text-sm text-neutral-500">{k}</p>
            <p className="text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-neutral-500">Total followers: {compact(profile?.follower_count ?? 0)}. Stats update every hour.</p>
      <div className="rounded-2xl border border-neutral-200 p-4">
        <p className="mb-2 text-sm font-medium">Views per day</p>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-36 w-full" preserveAspectRatio="none" role="img" aria-label={`Views per day over the last ${days} days`}>
          <polyline points={`0,${H} ${pts} ${W},${H}`} fill="#2563eb" fillOpacity="0.12" stroke="none" />
          <polyline points={pts} fill="none" stroke="#2563eb" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="rounded-2xl border border-neutral-200 p-4">
        <p className="mb-3 text-sm font-medium">Top videos</p>
        {top.length ? (
          <ul className="flex flex-col gap-3">
            {top.map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <Link href={`/v/${t.id}`} className="w-1/2 truncate">{t.title}</Link>
                <span className="w-20 text-right text-neutral-600">{compact(t.views)} views</span>
                <span className="h-2 flex-1 rounded-full bg-neutral-100"><span className="block h-2 rounded-full bg-blue-600" style={{ width: `${(t.views / topMax) * 100}%` }} /></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-neutral-500">Publish a video to see stats.</p>}
      </div>
    </div>
  );
}
