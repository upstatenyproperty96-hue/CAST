import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/client/profile-form";

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-4">
      <Link href="/" className="text-sm text-blue-600">← Home</Link>
      <h1 className="my-4 text-2xl font-bold">Edit profile</h1>
      <Suspense fallback={null}><Form /></Suspense>
    </div>
  );
}

async function Form() {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/settings");
  const { data } = await supabase.from("profiles")
    .select("id, handle, display_name, bio, website_url, likes_public, avatar_url").eq("id", user.id).single();
  return data ? <ProfileForm profile={data} /> : null;
}
