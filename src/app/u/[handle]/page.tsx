import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { compact, duration, thumbnail } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { BottomNav } from "@/components/bottom-nav";
import { toggleFollow, toggleBlock } from "@/app/actions/social";
import { startConversation } from "@/app/actions/messages";
import { ReportButton } from "@/components/client/report-button";
import { signOut } from "@/app/login/actions";
import { BadgeCheck, Mail } from "lucide-react";
import { PostCard } from "@/components/post-card";
import { POST_FIELDS, withViewerState, type FeedPost } from "@/lib/queries";

type Tab = "posts" | "videos" | "reposts" | "likes" | "playlists";

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
  const tab: Tab = (["videos", "reposts", "likes", "playlists"] as const).find((t) => t === sp.tab) ?? "posts";
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
  const { data: liveStream } = await supabase.from("live_streams").select("status").eq("creator_id", profile.id).maybeSingle();
  const following = user && !isMe
    ? !!(await supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("followee_id", profile.id).maybeSingle()).data
    : false;

  const tabs: Tab[] = profile.likes_public || isMe ? ["posts", "videos", "reposts", "likes", "playlists"] : ["posts", "videos", "reposts", "playlists"];

  return (
    <>
      <div className="relative h-36 bg-gradient-to-br from-emerald-500 via-teal-700 to-cyan-950 sm:h-44" style={profile.banner_url ? { backgroundImage: `url(${JSON.stringify(profile.banner_url)})`, backgroundSize: "cover" } : undefined} />
      <div className="px-4">
        <div className="-mt-12 flex items-end justify-between">
          <div className={`relative z-[1] rounded-full border-4 border-canvas ${liveStream?.status === "active" ? "ring-2 ring-red-600" : ""}`}><Avatar profile={profile} size={92} /></div>
          {isMe ? (
            <div className="flex gap-2">
              <Link href="/settings" className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-bold hover:bg-neutral-100">Edit profile</Link>
              <form action={signOut}><button className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-bold hover:bg-neutral-100">Sign out</button></form>
            </div>
          ) : user && blocked ? (
            <form action={toggleBlock}>
              <input type="hidden" name="profileId" value={profile.id} />
              <input type="hidden" name="blocked" value="1" />
              <button className="rounded-full border border-red-300 px-4 py-1.5 text-sm text-red-700">Unblock</button>
            </form>
          ) : user ? (
            <div className="flex gap-2">
              <form action={startConversation}>
                <input type="hidden" name="profileId" value={profile.id} />
                <button aria-label="Message" className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 hover:bg-neutral-100"><Mail size={18} /></button>
              </form>
              <form action={toggleFollow}>
                <input type="hidden" name="profileId" value={profile.id} />
                <input type="hidden" name="following" value={following ? "1" : "0"} />
                <button className={`h-9 rounded-full px-5 text-sm font-bold transition ${following ? "border border-neutral-300 hover:border-red-300 hover:text-red-600" : "bg-neutral-950 text-canvas hover:bg-neutral-800"}`}>
                  {following ? "Following" : "Follow"}
                </button>
              </form>
            </div>
          ) : (
            <Link href="/login" className="flex h-9 items-center rounded-full bg-neutral-950 px-5 text-sm font-bold text-canvas">Follow</Link>
          )}
        </div>
        <h1 className="mt-3 flex items-center gap-1.5 text-2xl font-extrabold text-neutral-950">
          {profile.display_name}
          {profile.is_verified && <BadgeCheck size={22} className="fill-blue-600 text-canvas" aria-label="Verified" />}
        </h1>
        {liveStream?.status === "active" && (
          <Link href={`/live/${profile.handle}`} className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-sm font-bold text-white"><span className="h-2 w-2 animate-pulse rounded-full bg-white" />LIVE now · Watch</Link>
        )}
        <p className="text-neutral-500">@{profile.handle}</p>
        {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-900">{profile.bio}</p>}
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
        <p className="mt-3 flex gap-4 text-sm text-neutral-500">
          <span><b className="text-neutral-950">{compact(profile.following_count)}</b> Following</span>
          <span><b className="text-neutral-950">{compact(profile.follower_count)}</b> Followers</span>
        </p>
      </div>
      <nav className="no-scrollbar sticky top-0 z-10 mt-4 flex overflow-x-auto border-b border-neutral-200 bg-canvas/85 backdrop-blur-xl">
        {tabs.map((t) => (
          <Link key={t} href={`/u/${profile.handle}${t === "posts" ? "" : `?tab=${t}`}`}
            className={`flex flex-1 justify-center px-3 pt-3 text-[15px] capitalize transition hover:bg-neutral-100/60 ${tab === t ? "font-bold text-neutral-950" : "font-medium text-neutral-500"}`}>
            <span className="relative pb-3">{t}{tab === t && <span className="bg-brand absolute inset-x-0 bottom-0 h-1 rounded-full" />}</span>
          </Link>
        ))}
      </nav>
      <TabContent tab={tab} profileId={profile.id} viewerId={user?.id} />
    </>
  );
}

type VideoRow = { id: string; title: string; duration_s: number | null; mux_playback_id: string | null; thumbnail_time_s: number; view_count: number };

function VideoList({ videos }: { videos: VideoRow[] }) {
  if (!videos.length) return <Empty text="No videos yet." />;
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 py-4">
      {videos.map((v) => {
        const thumb = thumbnail(v.mux_playback_id, v.thumbnail_time_s);
        return (
          <li key={v.id}>
            <Link href={`/v/${v.id}`} className="group block">
              <div className="relative overflow-hidden rounded-xl bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {thumb ? <img src={thumb} alt="" className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : <div className="aspect-video" />}
                {v.duration_s && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 text-[11px] font-semibold tabular-nums text-white">{duration(v.duration_s)}</span>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-neutral-950">{v.title}</p>
              <p className="mt-0.5 text-xs text-neutral-500">{compact(v.view_count)} views</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-8 py-14 text-center text-neutral-500">{text}</p>;
}

const VIDEO_FIELDS = "id, title, duration_s, mux_playback_id, thumbnail_time_s, view_count";

async function TabContent({ tab, profileId, viewerId }: { tab: Tab; profileId: string; viewerId?: string }) {
  const { supabase } = await getUser();
  if (tab === "posts") {
    const { data } = await supabase.from("posts").select(POST_FIELDS).eq("author_id", profileId)
      .order("created_at", { ascending: false }).limit(40);
    let posts = (data ?? []) as unknown as FeedPost[];
    if (viewerId) posts = await withViewerState(supabase, viewerId, posts);
    if (!posts.length) return <Empty text="No posts yet." />;
    return <>{posts.map((p) => <PostCard key={p.id} post={p} signedIn={!!viewerId} />)}</>;
  }
  if (tab === "videos") {
    const { data } = await supabase.from("videos").select(VIDEO_FIELDS).eq("creator_id", profileId)
      .eq("status", "ready").order("published_at", { ascending: false }).limit(50);
    return <VideoList videos={data ?? []} />;
  }
  if (tab === "reposts" || tab === "likes") {
    const kind = tab === "reposts" ? "repost" : "like";
    const { data } = await supabase.from("reactions")
      .select(`created_at, post:posts(${POST_FIELDS})`)
      .eq("user_id", profileId).eq("kind", kind).order("created_at", { ascending: false }).limit(40);
    let posts = (data ?? []).flatMap((r) => {
      const p = (r as unknown as { post: FeedPost | null }).post;
      return p ? [p] : [];
    });
    if (viewerId) posts = await withViewerState(supabase, viewerId, posts);
    if (!posts.length) return <Empty text={tab === "reposts" ? "No reposts yet." : "No likes yet."} />;
    return <>{posts.map((p) => <PostCard key={p.id} post={p} signedIn={!!viewerId} />)}</>;
  }
  const { data: playlists } = await supabase.from("playlists").select("id, title, playlist_items(count)").eq("owner_id", profileId).limit(50);
  if (!playlists?.length) return <Empty text="No playlists yet." />;
  return (
    <ul className="divide-y divide-neutral-200">
      {playlists.map((p) => (
        <li key={p.id} className="px-4 py-3 hover:bg-neutral-50">
          <Link href={`/p/${p.id}`} className="font-bold text-neutral-950">{p.title}</Link>
          <p className="text-sm text-neutral-500">{(p.playlist_items as unknown as { count: number }[])[0]?.count ?? 0} videos</p>
        </li>
      ))}
    </ul>
  );
}
