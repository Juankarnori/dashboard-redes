export function StatTile({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-[--radius-card] border border-border bg-surface-1 px-5 py-4 shadow-[0_1px_2px_rgba(30,26,43,0.04)]">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="tabular font-display mt-1.5 text-[1.75rem] font-semibold leading-none text-ink-900">
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-ink-400">{suffix}</span>}
      </p>
    </div>
  );
}
