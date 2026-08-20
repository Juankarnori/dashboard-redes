import { DAY_LABELS, type BestTimeSlot } from "@/lib/analytics/recommendations";
import { CHART_COLORS } from "@/lib/chart-theme";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SHORT_DAY_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Mezcla `accent` con blanco según `t` (0 = blanco, 1 = accent puro) — sin depender de color-mix del navegador. */
function accentAlpha(t: number): string {
  const hex = CHART_COLORS.accent.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const mix = (channel: number) => Math.round(255 + (channel - 255) * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

/**
 * Heatmap de mejor horario: día de la semana × hora, coloreado por
 * engagement promedio (mismo dato que ya usa la recomendación de "mejor
 * momento" — ver bestPostingTimes en recommendations.ts). Grilla CSS en
 * vez de un chart de Recharts porque no hay un tipo de heatmap nativo ahí.
 */
export function BestTimeHeatmap({ slots }: { slots: BestTimeSlot[] }) {
  if (slots.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-400">
        Sin suficientes publicaciones con métricas todavía.
      </div>
    );
  }

  const byKey = new Map(slots.map((s) => [`${s.dayOfWeek}:${s.hour}`, s]));
  const maxRate = Math.max(...slots.map((s) => s.avgEngagementRate));

  return (
    <div className="overflow-x-auto">
      <div className="grid w-max grid-cols-[2.5rem_repeat(24,1.75rem)] gap-[3px]">
        <div />
        {HOURS.map((h) => (
          <div key={h} className="text-center text-[0.6rem] text-ink-400">
            {h}
          </div>
        ))}

        {DAY_LABELS.map((label, dayOfWeek) => (
          <HeatmapRow key={dayOfWeek} dayOfWeek={dayOfWeek} shortLabel={SHORT_DAY_LABELS[dayOfWeek]}>
            {HOURS.map((hour) => {
              const slot = byKey.get(`${dayOfWeek}:${hour}`);
              const intensity = slot ? Math.max(0.12, slot.avgEngagementRate / maxRate) : 0;
              return (
                <div
                  key={hour}
                  title={
                    slot
                      ? `${label} ${hour}:00 — ${(slot.avgEngagementRate * 100).toFixed(1)}% (${slot.sampleSize} posts)`
                      : `${label} ${hour}:00 — sin datos`
                  }
                  className="h-[1.75rem] rounded-[3px]"
                  style={{ backgroundColor: slot ? accentAlpha(intensity) : "var(--surface-2)" }}
                />
              );
            })}
          </HeatmapRow>
        ))}
      </div>

      <p className="mt-3 text-xs text-ink-400">
        Más oscuro = mejor engagement promedio. Casillas vacías = sin publicaciones registradas en esa franja.
      </p>
    </div>
  );
}

function HeatmapRow({
  dayOfWeek,
  shortLabel,
  children,
}: {
  dayOfWeek: number;
  shortLabel: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div key={`label-${dayOfWeek}`} className="flex items-center text-xs font-medium text-ink-600">
        {shortLabel}
      </div>
      {children}
    </>
  );
}
