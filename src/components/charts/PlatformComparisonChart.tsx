"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { PLATFORM_COLORS, CHART_COLORS } from "@/lib/chart-theme";
import type { Platform } from "@/types/db";

interface DataPoint {
  platform: Platform;
  avgEngagementRate: number;
  contentCount: number;
}

export function PlatformComparisonChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-ink-400">
        Sin contenido con métricas todavía.
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, engagementPct: +(d.avgEngagementRate * 100).toFixed(2) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="platform"
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
          formatter={(value) => [`${value}%`, "Engagement promedio"]}
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
            <Cell key={entry.platform} fill={PLATFORM_COLORS[entry.platform] ?? CHART_COLORS.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
