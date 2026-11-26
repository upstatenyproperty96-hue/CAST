import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

// "Profile" in the nav points here, so pages don't need to look up the viewer's handle.
export default function Me() {
  return <Suspense fallback={null}><Go /></Suspense>;
}

async function Go(): Promise<null> {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/me");
  const { data } = await supabase.from("profiles").select("handle").eq("id", user.id).maybeSingle();
  redirect(data?.handle ? `/u/${data.handle}` : "/onboarding");
  return null;
}
