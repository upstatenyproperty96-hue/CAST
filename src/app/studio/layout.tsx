import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { profileFlags } from "@/lib/access";

// Studio is invite-only during the beta.
export default function StudioLayout({ children }: LayoutProps<"/studio">) {
  return <Suspense fallback={null}><Gate>{children}</Gate></Suspense>;
}

async function Gate({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/studio");
  if (!(await profileFlags(supabase, user.id)).betaAccess) redirect("/invite");
  return <>{children}</>;
}
