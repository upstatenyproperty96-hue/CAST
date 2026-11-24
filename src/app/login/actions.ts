"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-redirect";

const emailSchema = z.object({ email: z.email().max(254), next: z.string().max(200).optional() });

export async function sendMagicLink(formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email"), next: formData.get("next") ?? undefined });
  if (!parsed.success) redirect("/login?error=email");
  const next = safeNextPath(parsed.data.next);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  // Same message whether or not the address has an account, so emails can't be probed.
  redirect(error ? "/login?error=send" : "/login?sent=1");
}

const providerSchema = z.enum(["google", "apple"]);

export async function signInWithProvider(formData: FormData) {
  const provider = providerSchema.parse(formData.get("provider"));
  const next = safeNextPath(String(formData.get("next") ?? "/"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${publicEnv.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=provider");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
