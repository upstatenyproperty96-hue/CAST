"use client";
import { useActionState, useState } from "react";
import { updateProfile, setProfileImage, type ProfileState } from "@/app/actions/profile";
import { createClient } from "@/lib/supabase/client";

type Profile = { id: string; handle: string; display_name: string; bio: string; website_url: string | null; likes_public: boolean; avatar_url: string | null };

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {});
  const [avatar, setAvatar] = useState(profile.avatar_url);
  const [imgError, setImgError] = useState<string | null>(null);

  async function upload(kind: "avatar" | "banner", file: File | undefined) {
    setImgError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      return setImgError("Use a JPG, PNG, or WebP image under 5 MB.");
    }
    const ext = file.type.split("/")[1];
    const path = `${profile.id}/${kind}.${ext}`;
    const supabase = createClient();
    const { error } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true, contentType: file.type });
    if (error) return setImgError("Upload failed. Try again.");
    const url = `${supabase.storage.from("profile-images").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    await setProfileImage(kind, url);
    if (kind === "avatar") setAvatar(url);
  }

  const field = "w-full rounded-xl border border-neutral-300 px-3 py-2";
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {avatar ? <img src={avatar} alt="" className="h-20 w-20 rounded-full object-cover" /> : <span className="h-20 w-20 rounded-full bg-blue-100" />}
        <div className="flex flex-col gap-1 text-sm">
          <label className="cursor-pointer text-blue-600">Change photo
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload("avatar", e.target.files?.[0])} />
          </label>
          <label className="cursor-pointer text-blue-600">Change banner
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload("banner", e.target.files?.[0])} />
          </label>
          {imgError && <span className="text-red-600">{imgError}</span>}
        </div>
      </div>
      <form action={action} className="flex flex-col gap-3">
        <label className="text-sm font-medium">Name<input name="displayName" defaultValue={profile.display_name} maxLength={60} required className={field} /></label>
        <label className="text-sm font-medium">Handle<input name="handle" defaultValue={profile.handle} maxLength={30} required className={field} /></label>
        <label className="text-sm font-medium">Bio<textarea name="bio" defaultValue={profile.bio} maxLength={300} rows={3} className={field} /></label>
        <label className="text-sm font-medium">Website<input name="website" type="url" defaultValue={profile.website_url ?? ""} placeholder="https://" className={field} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="likesPublic" defaultChecked={profile.likes_public} /> Show my Likes tab to everyone</label>
        <button disabled={pending} className="rounded-full bg-blue-600 py-3 font-semibold text-white disabled:opacity-60">{pending ? "Saving…" : "Save"}</button>
        {state.error && <p role="alert" className="text-red-600">{state.error}</p>}
        {state.saved && <p className="text-green-700">Saved.</p>}
      </form>
    </div>
  );
}
