import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Nightly job (Vercel Cron, see vercel.json): rolls raw view events into daily stats.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is rejected.
function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400_000);
  // Yesterday (final) and today (so far).
  for (const d of [yesterday, today]) {
    const { error } = await admin.rpc("rollup_video_stats", { p_day: d.toISOString().slice(0, 10) });
    if (error) return NextResponse.json({ error: "Roll-up failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
