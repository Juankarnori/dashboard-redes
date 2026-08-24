import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { ContentTypeBadge } from "@/components/dashboard/ContentTypeBadge";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { StatTile } from "@/components/dashboard/StatTile";
import { ThumbnailImage } from "@/components/dashboard/ThumbnailImage";
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
            <ThumbnailImage
              src={content.thumbnail_url}
              alt={content.caption ?? "Contenido"}
              className="object-cover"
            />
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
          {content.permalink &&
            (account?.platform === "tiktok" ? (
              // TikTok no tiene video reproducible acá (ver "Limitaciones
              // conocidas de TikTok" en el README) — este es el único
              // lugar donde se puede ver/reproducir la pieza, así que va
              // más prominente que el link discreto de las otras redes.
              <a
                href={content.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex h-9 items-center justify-center rounded-[0.55rem] bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
              >
                Ver video en TikTok →
              </a>
            ) : (
              <a
                href={content.permalink}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
              >
                Ver original →
              </a>
            ))}
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
            {account?.platform === "tiktok" ? (
              <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-4 py-4 text-sm text-ink-600">
                TikTok no expone comentarios de terceros con el acceso actual a su API (Login
                Kit / Content Posting API no incluyen un scope de comentarios) — no es algo que
                podamos traer desde acá.
                {content.permalink && (
                  <>
                    {" "}
                    <a
                      href={content.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      Respondé directamente en TikTok →
                    </a>
                  </>
                )}
              </div>
            ) : (
              <CommentsPanel comments={comments} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
