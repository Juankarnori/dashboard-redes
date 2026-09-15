import { Sparkline } from "./Sparkline";

export function StatTile({
  label,
  value,
  suffix,
  trend,
  hint,
}: {
  label: string;
  value: string;
  suffix?: string;
  /** Serie corta (más vieja → más nueva) para el mini gráfico — se omite si hay menos de 2 puntos. */
  trend?: number[];
  /** Aclaración opcional (tooltip nativo) — para KPIs cuyo cálculo no es obvio a simple vista. */
  hint?: string;
}) {
  return (
    <div className="rounded-[--radius-card] border border-border bg-surface-1 px-5 py-4 shadow-[0_1px_2px_rgba(30,26,43,0.04)]">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400" title={hint}>
        {label}
        {hint && <span aria-hidden> ⓘ</span>}
      </p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p className="tabular font-display text-[1.75rem] font-semibold leading-none text-ink-900">
          {value}
          {suffix && <span className="ml-1 text-sm font-normal text-ink-400">{suffix}</span>}
        </p>
        {trend && <Sparkline data={trend} />}
      </div>
    </div>
  );
}
