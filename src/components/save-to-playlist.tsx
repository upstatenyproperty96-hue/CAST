import { getUser } from "@/lib/supabase/server";
import { addToPlaylist, createPlaylist } from "@/app/actions/social";

export async function SaveToPlaylist({ videoId }: { videoId: string }) {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data: lists } = await supabase.from("playlists").select("id, title, playlist_items(video_id)").eq("owner_id", user.id).limit(50);
  type L = { id: string; title: string; playlist_items: { video_id: string }[] };
  const rows = (lists ?? []) as unknown as L[];
  return (
    <details className="mx-auto max-w-xl bg-canvas px-4 py-3 text-neutral-900">
      <summary className="cursor-pointer font-semibold">Save to playlist</summary>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((l) => {
          const saved = l.playlist_items.some((i) => i.video_id === videoId);
          return (
            <li key={l.id} className="flex items-center justify-between">
              <span>{l.title}</span>
              {saved ? <span className="text-sm text-green-700">Saved</span> : (
                <form action={addToPlaylist}>
                  <input type="hidden" name="playlistId" value={l.id} />
                  <input type="hidden" name="videoId" value={videoId} />
                  <button className="text-sm text-blue-600">Add</button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
      <form action={createPlaylist} className="mt-3 flex gap-2">
        <input type="hidden" name="videoId" value={videoId} />
        <input name="title" required maxLength={100} placeholder="New playlist name" className="flex-1 rounded-full border border-neutral-300 px-3 py-1.5 text-sm" />
        <button className="rounded-full bg-blue-600 px-3 text-sm font-semibold text-white">Create</button>
      </form>
    </details>
  );
}
