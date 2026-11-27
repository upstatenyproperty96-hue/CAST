import { Suspense } from "react";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mux } from "@/lib/mux";
import { StudioNav } from "@/components/studio-nav";
import { SecretField } from "@/components/client/secret-field";
import { setupLiveStream, updateLiveTitle, resetStreamKey } from "@/app/actions/live";

const SERVER_URL = "rtmps://global-live.mux.com:443/app";

export default function LivePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <StudioNav active="/studio/live" />
      <Suspense fallback={<p className="text-neutral-500">Loading…</p>}><Live /></Suspense>
    </div>
  );
}

async function Live() {
  const { user } = await getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: stream } = await admin.from("live_streams").select("*").eq("creator_id", user.id).maybeSingle();
  const { data: me } = await admin.from("profiles").select("handle").eq("id", user.id).single();

  if (!stream) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">Go live</h1>
        <p className="text-neutral-600">Stream to your followers from OBS, Streamlabs, or a phone streaming app. Each stream is saved as a replay on your profile when you finish (up to 30 minutes during the beta).</p>
        <form action={setupLiveStream}><button className="rounded-full bg-blue-600 px-5 py-2 font-semibold text-white">Set up live streaming</button></form>
      </div>
    );
  }

  // The stream key is fetched fresh from Mux and shown only to its owner.
  const details = await mux().video.liveStreams.retrieve(stream.mux_live_stream_id).catch(() => null);
  const live = stream.status === "active";
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Go live</h1>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${live ? "bg-red-600 text-white" : "bg-neutral-100 text-neutral-600"}`}>
          {live ? "● LIVE" : "Offline"}
        </span>
      </div>

      <form action={updateLiveTitle} className="flex gap-2">
        <input name="title" defaultValue={stream.title} maxLength={120} placeholder="What's this stream about?" className="flex-1 rounded-lg border border-neutral-300 px-3 py-2" />
        <button className="rounded-lg border border-neutral-300 px-4">Save</button>
      </form>

      <section className="space-y-3 rounded-xl border border-neutral-200 p-4">
        <h2 className="font-semibold">Your streaming settings</h2>
        <SecretField label="Server" value={SERVER_URL} />
        {details?.stream_key
          ? <SecretField label="Stream key" value={details.stream_key} secret />
          : <p className="text-sm text-red-600">Couldn&apos;t load your stream key. Refresh the page.</p>}
        <p className="text-sm text-neutral-500">Keep the stream key private: anyone with it can stream to your channel.</p>
        <form action={resetStreamKey}><button className="text-sm text-red-600">Make a new stream key</button></form>
      </section>

      <section className="space-y-2 text-sm text-neutral-700">
        <h2 className="font-semibold text-neutral-900">How to go live</h2>
        <p><b>On a computer:</b> in OBS or Streamlabs, open Settings → Stream, choose &quot;Custom&quot;, and paste the server and stream key above. Click Start Streaming.</p>
        <p><b>On a phone:</b> use a free app like Larix Broadcaster or Prism Live. Add a new connection with the server, then the stream key.</p>
        <p>Your followers watch at <Link href={`/live/${me?.handle}`} className="text-blue-600">cast/live/{me?.handle}</Link>. When you stop, the replay appears in your Library.</p>
      </section>
    </div>
  );
}
