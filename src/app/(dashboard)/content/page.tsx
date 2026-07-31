import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { ContentTypeBadge } from "@/components/dashboard/ContentTypeBadge";
import { getContentGallery } from "@/lib/analytics/queries";
import type { Platform } from "@/types/db";

export const dynamic = "force-dynamic";

export default async function ContentGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string }>;
}) {
  const { brand, platform } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color");

  const items = await getContentGallery(supabase, {
    brandId: brand,
    platform: platform as Platform | undefined,
  });

  return (
    <>
      <PageHeader
        title="Contenido"
        description="Posts, reels e historias de todas tus cuentas, en una sola galería."
      />
      <FilterBar brands={brands ?? []} />

      <div className="px-4 py-6 sm:px-8">
        {items.length === 0 ? (
          <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
            Todavía no hay contenido sincronizado. Corre /api/sync (Fase 2) o espera
            al próximo GitHub Action programado.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/content/${item.id}`}
                className="group overflow-hidden rounded-[--radius-card] border border-border bg-surface-1 transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-square bg-surface-2">
                  {item.thumbnail_url ? (
                    <Image
                      src={item.thumbnail_url}
                      alt={item.caption ?? "Contenido"}
                      fill
                      unoptimized
                      className="object-cover transition-transform group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ink-400">
                      Sin miniatura
                    </div>
                  )}
                  <div className="absolute left-2 top-2">
                    <ContentTypeBadge type={item.type} />
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs text-ink-600">
                    {item.published_at
                      ? new Date(item.published_at).toLocaleDateString("es", {
                          day: "2-digit",
                          month: "short",
                        })
                      : "Sin fecha"}
                  </p>
                  {item.engagementRate !== null && (
                    <p className="tabular mt-0.5 text-xs font-medium text-ink-900">
                      {(item.engagementRate * 100).toFixed(1)}% engagement
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
