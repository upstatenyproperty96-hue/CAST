"use client";
import { useActionState, useState } from "react";
import { quotePost } from "@/app/actions/social";

const MAX = 1000;

export function QuoteComposer({ postId, children }: { postId: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(quotePost, undefined);
  const [text, setText] = useState("");
  const left = MAX - text.length;
  return (
    <form action={action}>
      <input type="hidden" name="postId" value={postId} />
      <textarea name="body" autoFocus rows={3} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Add your take…" aria-label="Your comment"
        className="w-full resize-none border-0 !bg-transparent pt-2 text-xl text-neutral-950 outline-none placeholder:text-neutral-500" />
      {children}
      {state?.error && <p role="alert" className="mt-3 text-sm text-red-600">{state.error}</p>}
      <div className="mt-4 flex items-center justify-end gap-4 border-t border-neutral-200 pt-3">
        {text.length > MAX - 100 && <span className={`text-sm tabular-nums ${left < 20 ? "text-red-600" : "text-neutral-500"}`}>{left}</span>}
        <button disabled={pending || !text.trim()} className="bg-brand rounded-full px-5 py-2 font-bold text-white disabled:opacity-50">
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </form>
  );
}
