"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useChartColors } from "@/lib/chart-theme";
import type { TrendPoint } from "@/lib/analytics/queries";

/** Tendencia diaria de alcance/interacciones (Analíticas) — mismos snapshots que alimentan los KPIs de Resumen, ver getTrendSeries. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const c = useChartColors();

  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-400">
        Se necesita más de un día de datos para ver la tendencia. Vuelve después del próximo sync.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("es", { day: "2-digit", month: "short" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.axis }} tickLine={false} axisLine={{ stroke: c.grid }} />
        <YAxis
          tick={{ fontSize: 11, fill: c.axis, fontFamily: "var(--font-sans)" }}
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="reach"
          name="Alcance / vistas"
          stroke={c.accent}
          fill={c.accent}
          fillOpacity={0.15}
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="interactions"
          name="Interacciones"
          stroke={c.positive}
          fill={c.positive}
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
