import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ContentTypeBadge } from "@/components/dashboard/ContentTypeBadge";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { StatTile } from "@/components/dashboard/StatTile";
import { MetricEvolutionChart } from "@/components/charts/MetricEvolutionChart";
import { getContentDetail, getContentComments } from "@/lib/analytics/queries";
import { CommentsPanel } from "./CommentsPanel";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ contentId: string }>;
}) {
  const { contentId } = await params;
  const supabase = await createClient();
  const detail = await getContentDetail(supabase, contentId);

  if (!detail) notFound();

  const { content, metricsHistory } = detail;
  const comments = await getContentComments(supabase, contentId);
  const account = content.accounts as unknown as {
    username: string | null;
    display_name: string | null;
    platform: "instagram" | "facebook" | "tiktok";
    brands: { name: string; color: string } | null;
  } | null;
  const latest = metricsHistory.at(-1);

  return (
    <>
      <PageHeader
        title="Detalle de contenido"
        description={
          content.published_at
            ? new Date(content.published_at).toLocaleString("es", {
                dateStyle: "long",
                timeStyle: "short",
              })
            : undefined
        }
      />

      <div className="grid grid-cols-1 gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[280px_1fr]">
        <div>
          <div className="relative aspect-square overflow-hidden rounded-[--radius-card] border border-border bg-surface-2">
            {content.thumbnail_url ? (
              <Image
                src={content.thumbnail_url}
                alt={content.caption ?? "Contenido"}
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-400">
                Sin miniatura
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ContentTypeBadge type={content.type} />
            {account && <PlatformBadge platform={account.platform} />}
            {account?.brands && (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-600">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: account.brands.color }}
                />
                {account.brands.name}
              </span>
            )}
          </div>
          {content.caption && (
            <p className="mt-3 text-sm text-ink-600">{content.caption}</p>
          )}
          {content.permalink && (
            <a
              href={content.permalink}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            >
              Ver original →
            </a>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {metricsHistory.length === 0 ? (
            <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
              Todavía no hay métricas para esta pieza — llegan en el próximo sync.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <StatTile label="Alcance" value={String(latest?.reach ?? "—")} />
                <StatTile label="Likes" value={String(latest?.likes ?? "—")} />
                <StatTile label="Comentarios" value={String(latest?.comments ?? "—")} />
                <StatTile label="Compartidos" value={String(latest?.shares ?? "—")} />
              </div>

              <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
                <h3 className="mb-3 text-sm font-semibold text-ink-900">Evolución en el tiempo</h3>
                <MetricEvolutionChart data={metricsHistory} />
              </div>

              {latest && Object.keys(latest.metrics ?? {}).length > 0 && (
                <div className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
                  <h3 className="mb-3 text-sm font-semibold text-ink-900">
                    Métricas específicas del tipo
                  </h3>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {Object.entries(latest.metrics as Record<string, unknown>).map(
                      ([key, value]) =>
                        value !== undefined ? (
                          <div key={key}>
                            <dt className="text-xs text-ink-400">{key}</dt>
                            <dd className="tabular text-sm font-medium text-ink-900">
                              {String(value)}
                            </dd>
                          </div>
                        ) : null
                    )}
                  </dl>
                </div>
              )}
            </>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-ink-900">Comentarios</h3>
            <CommentsPanel comments={comments} />
          </div>
        </div>
      </div>
    </>
  );
}
