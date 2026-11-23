import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/client/upload-form";
import { StudioNav } from "@/components/studio-nav";

export default function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <StudioNav active="/studio" />
      <Suspense fallback={null}><Form /></Suspense>
    </div>
  );
}

async function Form() {
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id, name").order("sort_order");
  return <UploadForm topics={topics ?? []} />;
}
