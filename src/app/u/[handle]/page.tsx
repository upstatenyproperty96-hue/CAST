import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { compact, duration, thumbnail } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { BottomNav } from "@/components/bottom-nav";
import { toggleFollow, toggleBlock } from "@/app/actions/social";
import { ReportButton } from "@/components/client/report-button";
import { signOut } from "@/app/login/actions";

type Tab = "videos" | "reposts" | "likes" | "playlists";

export default function ProfilePage(props: PageProps<"/u/[handle]">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}>
        <Profile {...props} />
      </Suspense>
      <BottomNav />
    </div>
  );
}

async function Profile({ params, searchParams }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const sp = await searchParams;
  const tab: Tab = (["reposts", "likes", "playlists"] as const).find((t) => t === sp.tab) ?? "videos";
  const { supabase, user } = await getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, handle, display_name, bio, avatar_url, banner_url, is_verified, follower_count, following_count, likes_public")
    .eq("handle", handle)
    .maybeSingle();
  if (!profile) notFound();

  const isMe = user?.id === profile.id;
  const blocked = user && !isMe
    ? !!(await supabase.from("blocks").select("blocked_id").eq("blocker_id", user.id).eq("blocked_id", profile.id).maybeSingle()).data
    : false;
  const following = user && !isMe
    ? !!(await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("followee_id", profile.id).maybeSingle()).data
    : false;

  const tabs: Tab[] = profile.likes_public || isMe ? ["videos", "reposts", "likes", "playlists"] : ["videos", "reposts", "playlists"];

  return (
    <>
      <div className="h-32 bg-gradient-to-r from-sky-400 to-indigo-500" style={profile.banner_url ? { backgroundImage: `url(${JSON.stringify(profile.banner_url)})`, backgroundSize: "cover" } : undefined} />
      <div className="px-4">
        <div className="-mt-10 flex items-end justify-between">
          <div className="rounded-full border-4 border-white"><Avatar profile={profile} size={80} /></div>
          {isMe ? (
            <div className="flex gap-2">
              <Link href="/settings" className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm">Edit profile</Link>
              <form action={signOut}><button className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm">Sign out</button></form>
            </div>
          ) : user && blocked ? (
            <form action={toggleBlock}>
              <input type="hidden" name="profileId" value={profile.id} />
              <input type="hidden" name="blocked" value="1" />
              <button className="rounded-full border border-red-300 px-4 py-1.5 text-sm text-red-700">Unblock</button>
            </form>
          ) : user ? (
            <form action={toggleFollow}>
              <input type="hidden" name="profileId" value={profile.id} />
              <input type="hidden" name="following" value={following ? "1" : "0"} />
              <button className={`rounded-full px-5 py-1.5 text-sm font-semibold ${following ? "border border-neutral-300" : "bg-blue-600 text-white"}`}>
                {following ? "Following" : "Follow"}
              </button>
            </form>
          ) : (
            <Link href="/login" className="rounded-full bg-blue-600 px-5 py-1.5 text-sm font-semibold text-white">Follow</Link>
          )}
        </div>
        <h1 className="mt-2 text-xl font-bold">{profile.display_name} {profile.is_verified && <span className="text-blue-600">✔</span>}</h1>
        <p className="text-neutral-500">@{profile.handle}</p>
        {profile.bio && <p className="mt-2 whitespace-pre-wrap">{profile.bio}</p>}
        {user && !isMe && !blocked && (
          <div className="mt-1 flex gap-3 text-xs text-neutral-500">
            <form action={toggleBlock}>
              <input type="hidden" name="profileId" value={profile.id} />
              <input type="hidden" name="blocked" value="0" />
              <button>Block</button>
            </form>
            <ReportButton target="user" targetId={profile.id} />
          </div>
        )}
        <p className="mt-2 text-sm text-neutral-600">
          <b className="text-neutral-900">{compact(profile.following_count)}</b> Following · <b className="text-neutral-900">{compact(profile.follower_count)}</b> Followers
        </p>
      </div>
      <nav className="mt-3 flex border-b border-neutral-200">
        {tabs.map((t) => (
          <Link key={t} href={`/u/${profile.handle}${t === "videos" ? "" : `?tab=${t}`}`}
            className={`flex-1 py-2 text-center text-sm capitalize ${tab === t ? "border-b-2 border-blue-600 font-semibold text-blue-600" : "text-neutral-600"}`}>
            {t}
          </Link>
        ))}
      </nav>
      <TabContent tab={tab} profileId={profile.id} />
    </>
  );
}

type VideoRow = { id: string; title: string; duration_s: number | null; mux_playback_id: string | null; thumbnail_time_s: number; view_count: number };

function VideoList({ videos }: { videos: VideoRow[] }) {
  if (!videos.length) return <p className="p-6 text-center text-neutral-500">Nothing here yet.</p>;
  return (
    <ul>
      {videos.map((v) => {
        const thumb = thumbnail(v.mux_playback_id, v.thumbnail_time_s);
        return (
          <li key={v.id}>
            <Link href={`/v/${v.id}`} className="flex gap-3 px-4 py-2">
              <div className="relative w-36 shrink-0 overflow-hidden rounded-lg bg-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb && <img src={thumb} alt="" className="aspect-video w-full object-cover" loading="lazy" />}
                {v.duration_s && <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-xs text-white">{duration(v.duration_s)}</span>}
              </div>
              <div className="min-w-0">
                <p className="line-clamp-2 font-medium">{v.title}</p>
                <p className="text-sm text-neutral-500">{compact(v.view_count)} views</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const VIDEO_FIELDS = "id, title, duration_s, mux_playback_id, thumbnail_time_s, view_count";

async function TabContent({ tab, profileId }: { tab: Tab; profileId: string }) {
  const { supabase } = await getUser();
  if (tab === "videos") {
    const { data } = await supabase.from("videos").select(VIDEO_FIELDS).eq("creator_id", profileId)
      .eq("status", "ready").order("published_at", { ascending: false }).limit(50);
    return <VideoList videos={data ?? []} />;
  }
  if (tab === "reposts" || tab === "likes") {
    const kind = tab === "reposts" ? "repost" : "like";
    const { data } = await supabase.from("reactions")
      .select(`created_at, post:posts(video:videos(${VIDEO_FIELDS}))`)
      .eq("user_id", profileId).eq("kind", kind).order("created_at", { ascending: false }).limit(50);
    const videos = (data ?? []).flatMap((r) => {
      const v = (r as unknown as { post: { video: VideoRow | null } | null }).post?.video;
      return v ? [v] : [];
    });
    return <VideoList videos={videos} />;
  }
  const { data: playlists } = await supabase.from("playlists").select("id, title, playlist_items(count)").eq("owner_id", profileId).limit(50);
  if (!playlists?.length) return <p className="p-6 text-center text-neutral-500">No playlists yet.</p>;
  return (
    <ul className="divide-y divide-neutral-200">
      {playlists.map((p) => (
        <li key={p.id} className="px-4 py-3">
          <Link href={`/p/${p.id}`} className="font-medium">{p.title}</Link>
          <p className="text-sm text-neutral-500">{(p.playlist_items as unknown as { count: number }[])[0]?.count ?? 0} videos</p>
        </li>
      ))}
    </ul>
  );
}
