import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { POST_FIELDS, withViewerState, type FeedPost } from "@/lib/queries";
import { PostCard } from "@/components/post-card";
import { Comments } from "@/components/comments";
import { BottomNav } from "@/components/bottom-nav";
import { deletePost } from "@/app/actions/social";

// One post with its comments: the page for text and quote posts (video posts open the video page).
export default function PostPage(props: PageProps<"/post/[id]">) {
  return (
    <div className="mx-auto w-full max-w-xl pb-20">
      <header className="sticky top-0 z-10 flex items-center gap-6 border-b border-neutral-200 bg-canvas/85 px-4 py-3 backdrop-blur-xl">
        <Link href="/" aria-label="Back" className="rounded-full p-1 hover:bg-neutral-100"><ArrowLeft size={20} /></Link>
        <h1 className="text-lg font-bold text-neutral-950">Post</h1>
      </header>
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><Inner {...props} /></Suspense>
      <BottomNav />
    </div>
  );
}

async function Inner({ params }: PageProps<"/post/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user } = await getUser();
  const { data } = await supabase.from("posts").select(`${POST_FIELDS}, author_id`).eq("id", id).maybeSingle();
  if (!data) notFound();
  const row = data as unknown as FeedPost & { author_id: string };
  const [post] = user ? await withViewerState(supabase, user.id, [row]) : [row];
  return (
    <>
      <PostCard post={post} signedIn={!!user} />
      {user?.id === row.author_id && (
        <form action={deletePost} className="border-b border-neutral-200 px-4 py-2 text-right">
          <input type="hidden" name="postId" value={row.id} />
          <button className="text-sm text-red-600">Delete post</button>
        </form>
      )}
      <Comments postId={row.id} postAuthorId={row.author_id} />
    </>
  );
}
