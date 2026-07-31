"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { CHART_COLORS } from "@/lib/chart-theme";

interface Snapshot {
  captured_at: string;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}

const SERIES: { key: keyof Snapshot; label: string; color: string }[] = [
  { key: "reach", label: "Alcance", color: CHART_COLORS.accent },
  { key: "likes", label: "Likes", color: CHART_COLORS.live },
  { key: "comments", label: "Comentarios", color: CHART_COLORS.positive },
  { key: "shares", label: "Compartidos", color: CHART_COLORS.negative },
];

export function MetricEvolutionChart({ data }: { data: Snapshot[] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-ink-400">
        Se necesita más de un snapshot para ver la evolución. Vuelve después del próximo sync.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.captured_at).toLocaleString("es", { day: "2-digit", month: "short", hour: "2-digit" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
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
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {SERIES.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
