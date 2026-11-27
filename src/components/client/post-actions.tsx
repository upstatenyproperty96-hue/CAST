"use client";
import { useEffect, useOptimistic, useRef, useState, startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, MessageCircle, PenLine, Repeat2, Share } from "lucide-react";
import { toggleReaction } from "@/app/actions/social";
import { ShareButton } from "./share-button";

type State = { liked: boolean; reposted: boolean; likes: number; reposts: number };

function fmt(n: number) {
  return n ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n) : "";
}

// Comment, repost (or quote), like and share, as on X. Taps update at once and save in the background.
export function PostActions(props: {
  postId: string; commentHref: string; sharePath: string; shareTitle: string;
  comments: number; likes: number; reposts: number; liked: boolean; reposted: boolean;
  signedIn: boolean; size?: "sm" | "lg";
}) {
  const [state, apply] = useOptimistic<State, "like" | "repost">(
    { liked: props.liked, reposted: props.reposted, likes: props.likes, reposts: props.reposts },
    (s, kind) => kind === "like"
      ? { ...s, liked: !s.liked, likes: s.likes + (s.liked ? -1 : 1) }
      : { ...s, reposted: !s.reposted, reposts: s.reposts + (s.reposted ? -1 : 1) },
  );
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  function toggle(kind: "like" | "repost") {
    if (!props.signedIn) { router.push("/login"); return; }
    const active = kind === "like" ? state.liked : state.reposted;
    const fd = new FormData();
    fd.set("postId", props.postId);
    fd.set("kind", kind);
    fd.set("active", active ? "1" : "0");
    startTransition(async () => { apply(kind); await toggleReaction(fd); });
  }

  const icon = props.size === "lg" ? 22 : 19;
  const btn = "group flex items-center gap-1.5 text-sm text-neutral-500 transition";
  const halo = "flex h-9 w-9 items-center justify-center rounded-full transition";

  return (
    <div className="-ml-2 mt-1 flex items-center justify-between pr-2">
      <Link href={props.commentHref} className={`${btn} hover:text-blue-500`} aria-label="Comment">
        <span className={`${halo} group-hover:bg-blue-500/10`}><MessageCircle size={icon} /></span>{fmt(props.comments)}
      </Link>

      <div className="relative" ref={menuRef}>
        <button type="button" onClick={() => (props.signedIn ? setMenu((m) => !m) : router.push("/login"))}
          className={`${btn} ${state.reposted ? "text-emerald-400" : "hover:text-emerald-400"}`} aria-label="Repost" aria-expanded={menu}>
          <span className={`${halo} group-hover:bg-emerald-400/10`}><Repeat2 size={icon} strokeWidth={state.reposted ? 2.6 : 2} /></span>{fmt(state.reposts)}
        </button>
        {menu && (
          <div className="absolute left-0 top-10 z-30 w-48 overflow-hidden rounded-2xl border border-neutral-200 bg-raised shadow-2xl shadow-black">
            <button type="button" onClick={() => { setMenu(false); toggle("repost"); }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold text-neutral-900 hover:bg-neutral-100">
              <Repeat2 size={18} />{state.reposted ? "Undo repost" : "Repost"}
            </button>
            <Link href={`/compose?quote=${props.postId}`} onClick={() => setMenu(false)}
              className="flex items-center gap-3 px-4 py-3 font-semibold text-neutral-900 hover:bg-neutral-100">
              <PenLine size={18} />Quote
            </Link>
          </div>
        )}
      </div>

      <button type="button" onClick={() => toggle("like")} aria-label={state.liked ? "Unlike" : "Like"} aria-pressed={state.liked}
        className={`${btn} ${state.liked ? "text-pink-500" : "hover:text-pink-500"}`}>
        <span className={`${halo} group-hover:bg-pink-500/10`}>
          <Heart size={icon} fill={state.liked ? "currentColor" : "none"} className={state.liked ? "animate-[pop_.25s_ease-out]" : ""} />
        </span>{fmt(state.likes)}
      </button>

      <ShareButton path={props.sharePath} title={props.shareTitle} className={`${btn} hover:text-blue-500`}>
        <span className={`${halo} hover:bg-blue-500/10`}><Share size={icon - 1} /></span>
      </ShareButton>
    </div>
  );
}
