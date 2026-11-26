"use client";
import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessage, markConversationRead } from "@/app/actions/messages";

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(sendMessage, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (!pending && !state?.error) form.current?.reset(); }, [pending, state]);
  return (
    <form ref={form} action={action} className="sticky bottom-0 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {state?.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea name="body" required maxLength={2000} rows={1} placeholder="Message"
          className="flex-1 resize-none rounded-2xl border border-neutral-300 px-3 py-2"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.current?.requestSubmit(); } }} />
        <button disabled={pending} className="rounded-full bg-blue-600 px-4 font-semibold text-white disabled:opacity-50">Send</button>
      </div>
    </form>
  );
}

// Picks up new messages while the conversation is open.
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}

export function MarkRead({ conversationId, latest }: { conversationId: string; latest: string | null }) {
  useEffect(() => { void markConversationRead(conversationId); }, [conversationId, latest]);
  return null;
}
