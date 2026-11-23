import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

// Finishes email-link and Google/Apple sign-in.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // New users pick their topics first so For You has something to go on.
      const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", data.user.id).maybeSingle();
      return NextResponse.redirect(new URL(profile && !profile.onboarded ? "/onboarding" : next, origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=signin", origin));
}
