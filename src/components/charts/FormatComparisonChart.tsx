"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CHART_COLORS } from "@/lib/chart-theme";
import type { ContentType } from "@/types/db";
import type { FormatStats } from "@/lib/analytics/recommendations";

const TYPE_LABELS: Record<ContentType, string> = {
  post: "Imagen",
  carousel: "Carrusel",
  reel: "Reel",
  story: "Historia",
  video: "Video",
};

/** Mismos datos que `formatComparison()` (recommendations.ts) — no recalcula engagement, solo grafica. */
export function FormatComparisonChart({ data }: { data: FormatStats[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-400">
        Sin contenido con métricas todavía.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: TYPE_LABELS[d.type] ?? d.type,
    engagementPct: +(d.avgEngagementRate * 100).toFixed(2),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 12, fill: CHART_COLORS.axis }}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: CHART_COLORS.axis, fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={false}
          width={44}
          unit="%"
        />
        <Tooltip
          formatter={(value, _name, item) => [
            `${value}% (${item.payload.sampleSize} piezas)`,
            "Engagement promedio",
          ]}
          contentStyle={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        />
        <Bar dataKey="engagementPct" radius={[6, 6, 0, 0]} maxBarSize={64}>
          {chartData.map((entry) => (
            <Cell key={entry.type} fill={CHART_COLORS.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
