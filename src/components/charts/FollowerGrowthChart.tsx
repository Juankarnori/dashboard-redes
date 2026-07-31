"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "@/lib/chart-theme";

export function FollowerGrowthChart({ data }: { data: { date: string; followers: number }[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-400">
        Necesitamos más días de datos para graficar el crecimiento.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="followerFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.25} />
            <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: CHART_COLORS.axis, fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: CHART_COLORS.axis, fontFamily: "var(--font-mono)" }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        />
        <Area
          type="monotone"
          dataKey="followers"
          stroke={CHART_COLORS.accent}
          strokeWidth={2}
          fill="url(#followerFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
