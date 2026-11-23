import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/client/upload-form";
import { Logo } from "@/components/logo";

export default function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/"><Logo className="!text-2xl" /></Link>
        <nav className="flex gap-4 text-sm">
          <span className="font-semibold text-blue-600">Upload</span>
          <Link href="/studio/library" className="text-neutral-600">Library</Link>
        </nav>
      </header>
      <h1 className="mb-4 text-2xl font-bold">Studio</h1>
      <Suspense fallback={null}><Form /></Suspense>
    </div>
  );
}

async function Form() {
  const supabase = await createClient();
  const { data: topics } = await supabase.from("topics").select("id, name").order("sort_order");
  return <UploadForm topics={topics ?? []} />;
}
