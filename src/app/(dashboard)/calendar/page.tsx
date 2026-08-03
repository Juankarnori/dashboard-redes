import Link from "next/link";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { CalendarGrid } from "./CalendarGrid";
import { NewCampaignForm } from "./NewCampaignForm";
import { NewCalendarItemForm } from "./NewCalendarItemForm";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types/db";

export const dynamic = "force-dynamic";

function parseMonthParam(month?: string): Date {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const parsed = new Date(`${month}-01T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; platform?: string; campaign?: string; month?: string }>;
}) {
  const { brand, platform, campaign, month } = await searchParams;
  const supabase = await createClient();
  const { data: brands } = await supabase.from("brands").select("id, name, color");
  const selectedBrandId = brand ?? brands?.[0]?.id;

  const monthDate = parseMonthParam(month);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  // Semana arranca lunes; el grid incluye días de meses vecinos para
  // completar semanas enteras.
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd }).map((d) => ({
    dateKey: format(d, "yyyy-MM-dd"),
    dayOfMonth: format(d, "d"),
    inCurrentMonth: d >= monthStart && d <= monthEnd,
  }));

  const { data: campaigns } = selectedBrandId
    ? await supabase.from("campaigns").select("*").eq("brand_id", selectedBrandId).order("start_date")
    : { data: [] };

  const CALENDAR_ITEM_FIELDS =
    "id, idea, platform, scheduled_for, campaign_id, account_id, caption, media_path, media_type, status, external_post_id, permalink, publish_error";

  type CalendarItemRow = {
    id: string;
    idea: string | null;
    platform: string | null;
    scheduled_for: string | null;
    campaign_id: string | null;
    account_id: string | null;
    caption: string | null;
    media_path: string | null;
    media_type: string | null;
    status: string;
    external_post_id: string | null;
    permalink: string | null;
    publish_error: string | null;
  };

  let items: CalendarItemRow[] = [];
  if (selectedBrandId) {
    let itemsQuery = supabase
      .from("content_calendar")
      .select(CALENDAR_ITEM_FIELDS)
      .eq("brand_id", selectedBrandId)
      .gte("scheduled_for", gridStart.toISOString())
      .lte("scheduled_for", gridEnd.toISOString());

    if (platform) itemsQuery = itemsQuery.eq("platform", platform as Platform);
    if (campaign) itemsQuery = itemsQuery.eq("campaign_id", campaign);

    const { data } = await itemsQuery.order("scheduled_for", { ascending: true });
    items = data ?? [];
  }

  const { data: accounts } = selectedBrandId
    ? await supabase
        .from("accounts")
        .select("id, platform, role, display_name, username")
        .eq("brand_id", selectedBrandId)
        .eq("status", "active")
    : { data: [] };

  const monthParam = format(monthStart, "yyyy-MM");

  function buildUrl(overrides: Record<string, string | undefined>) {
    const merged = { brand, platform, campaign, month: monthParam, ...overrides };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/calendar?${params.toString()}`;
  }

  return (
    <>
      <PageHeader
        title="Calendario"
        description="Planificá contenido y agrupalo en campañas, por negocio."
        action={
          selectedBrandId && (
            <div className="flex items-center gap-2">
              <NewCampaignForm brandId={selectedBrandId} />
              <NewCalendarItemForm brandId={selectedBrandId} campaigns={campaigns ?? []} />
            </div>
          )
        }
      />
      <FilterBar brands={brands ?? []} />

      <div className="px-4 py-6 sm:px-8">
        {!selectedBrandId ? (
          <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
            Crea un negocio primero en Cuentas.
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link
                  href={buildUrl({ month: format(subMonths(monthStart, 1), "yyyy-MM") })}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[0.5rem] border border-border bg-surface-1 text-ink-600 transition-colors hover:bg-surface-2"
                  aria-label="Mes anterior"
                >
                  ←
                </Link>
                <span className="tabular w-36 text-center text-sm font-semibold capitalize text-ink-900">
                  {format(monthStart, "MMMM yyyy", { locale: es })}
                </span>
                <Link
                  href={buildUrl({ month: format(addMonths(monthStart, 1), "yyyy-MM") })}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[0.5rem] border border-border bg-surface-1 text-ink-600 transition-colors hover:bg-surface-2"
                  aria-label="Mes siguiente"
                >
                  →
                </Link>
              </div>

              {campaigns && campaigns.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <CampaignChip href={buildUrl({ campaign: undefined })} active={!campaign}>
                    Todas las campañas
                  </CampaignChip>
                  {campaigns.map((c) => (
                    <CampaignChip
                      key={c.id}
                      href={buildUrl({ campaign: c.id })}
                      active={campaign === c.id}
                      color={c.color}
                    >
                      {c.name}
                    </CampaignChip>
                  ))}
                </div>
              )}
            </div>

            <CalendarGrid
              days={days}
              items={items}
              campaigns={campaigns ?? []}
              accounts={accounts ?? []}
              brandId={selectedBrandId}
            />
          </>
        )}
      </div>
    </>
  );
}

function CampaignChip({
  href,
  active,
  color,
  children,
}: {
  href: string;
  active: boolean;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-border bg-surface-1 text-ink-600 hover:bg-surface-2"
      )}
    >
      {color && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
      {children}
    </Link>
  );
}
