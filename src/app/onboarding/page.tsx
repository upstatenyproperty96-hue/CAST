import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { saveTopics } from "@/app/actions/profile";
import { Logo } from "@/components/logo";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-6 py-10">
      <Logo />
      <h1 className="text-2xl font-bold">What do you want to watch?</h1>
      <p className="text-neutral-600">Pick at least one topic. You can change these later.</p>
      <Suspense fallback={null}><Topics /></Suspense>
    </main>
  );
}

async function Topics() {
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id, name").order("sort_order");
  return (
    <form action={saveTopics} className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3">
        {topics?.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-neutral-300 p-4 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
            <input type="checkbox" name="topic" value={t.id} className="accent-blue-600" />
            <span className="font-medium">{t.name}</span>
          </label>
        ))}
      </div>
      <button className="rounded-full bg-blue-600 py-3 font-semibold text-white">Continue</button>
    </form>
  );
}
