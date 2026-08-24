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

      {platform === "tiktok" && (
        <p className="mx-4 mt-4 rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-2.5 text-xs text-ink-600 sm:mx-8">
          TikTok no expone comentarios de terceros con el acceso actual a su API (Login Kit /
          Content Posting API no incluyen un scope de comentarios) — por eso esta vista siempre
          va a estar vacía para TikTok. Respondé directamente desde la app de TikTok.
        </p>
      )}

      <div className="px-4 py-6 sm:px-8">
        <CommentInbox comments={comments} />
      </div>
    </>
  );
}
