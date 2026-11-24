import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Recorder } from "@/components/client/recorder";
import { StudioNav } from "@/components/studio-nav";

export default function RecordPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      <StudioNav active="/studio/record" />
      <Suspense fallback={null}><Inner /></Suspense>
    </div>
  );
}

async function Inner() {
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id, name").order("sort_order");
  return <Recorder topics={topics ?? []} />;
}
