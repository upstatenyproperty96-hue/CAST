import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { X } from "lucide-react";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { POST_FIELDS, type FeedPost } from "@/lib/queries";
import { Avatar } from "@/components/avatar";
import { QuoteComposer } from "@/components/client/quote-composer";
import { QuotedPreview } from "@/components/post-card";

// Quote a post: write something, and the original appears underneath.
export default function ComposePage(props: PageProps<"/compose">) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <Suspense fallback={<p className="p-6 text-neutral-500">Loading…</p>}><Inner {...props} /></Suspense>
    </div>
  );
}

async function Inner({ searchParams }: PageProps<"/compose">) {
  const sp = await searchParams;
  const quoteId = typeof sp.quote === "string" ? sp.quote : "";
  if (!z.uuid().safeParse(quoteId).success) notFound();
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=/compose?quote=${quoteId}`);
  const [{ data: me }, { data }] = await Promise.all([
    supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("posts").select(POST_FIELDS).eq("id", quoteId).maybeSingle(),
  ]);
  if (!data) notFound();
  const quoted = data as unknown as FeedPost;
  return (
    <>
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Cancel" className="rounded-full p-1 text-neutral-900 hover:bg-neutral-100"><X size={22} /></Link>
      </header>
      <div className="flex gap-3 px-4">
        <Avatar profile={me} size={42} />
        <div className="min-w-0 flex-1">
          <QuoteComposer postId={quoted.id}>
            <QuotedPreview q={quoted} />
          </QuoteComposer>
        </div>
      </div>
    </>
  );
}
