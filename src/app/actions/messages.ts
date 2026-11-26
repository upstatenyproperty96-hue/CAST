"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";

const id = z.uuid();

// Opens the conversation with someone, if they follow you (or you've talked before).
export async function startConversation(formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) redirect("/login");
  const other = id.parse(formData.get("profileId"));
  const { data } = await supabase.rpc("start_conversation", { other });
  if (!data) redirect(`/messages?notice=follow`);
  redirect(`/messages/${data}`);
}

export async function sendMessage(_prev: { error?: string } | null, formData: FormData) {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Sign in first." };
  const conversationId = id.parse(formData.get("conversationId"));
  const body = z.string().trim().min(1).max(2000).safeParse(formData.get("body"));
  if (!body.success) return { error: "Messages are 1 to 2,000 characters." };
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, body: body.data });
  if (error) {
    return { error: error.message.includes("too fast") ? "You're sending messages too fast. Try again later." : "You can't message this person." };
  }
  revalidatePath(`/messages/${conversationId}`);
  return null;
}

export async function markConversationRead(conversationId: string) {
  const { supabase, user } = await getUser();
  if (!user || !id.safeParse(conversationId).success) return;
  await supabase.from("conversation_reads")
    .upsert({ conversation_id: conversationId, user_id: user.id, last_read_at: new Date().toISOString() });
}
