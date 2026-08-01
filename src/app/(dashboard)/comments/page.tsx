import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { getCommentsInbox } from "@/lib/analytics/queries";
import { CommentInbox } from "./CommentInbox";
import type { Platform } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function CommentsInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string }>;
}) {
  const { brand, platform } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color");

  const comments = await getCommentsInbox(supabase, {
    brandId: brand,
    platform: platform as Platform | undefined,
  });

  return (
    <>
      <PageHeader
        title="Comentarios"
        description="Todos los comentarios de Instagram y Facebook, en un solo lugar."
      />
      <FilterBar brands={brands ?? []} />

      <div className="px-4 py-6 sm:px-8">
        <CommentInbox comments={comments} />
      </div>
    </>
  );
}
