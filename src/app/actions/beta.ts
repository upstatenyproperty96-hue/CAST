"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";

export async function redeemInvite(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login?next=/invite");
  const code = z.string().trim().min(6).max(20).safeParse(formData.get("code"));
  const next = safeNextPath(String(formData.get("next") ?? "/studio"));
  if (!code.success) redirect("/invite?error=1");
  const { data } = await supabase.rpc("redeem_invite", { p_code: code.data });
  redirect(data ? next : "/invite?error=1");
}
