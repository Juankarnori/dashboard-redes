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
    <div className="rounded-[--radius-card] border border-border bg-surface-1 px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="tabular mt-1.5 text-2xl font-semibold text-ink-900">
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-ink-400">{suffix}</span>}
      </p>
    </div>
  );
}
