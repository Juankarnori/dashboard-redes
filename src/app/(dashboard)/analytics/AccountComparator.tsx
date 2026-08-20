import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import type { PlatformComparisonGroup } from "@/lib/analytics/queries";

/** Comparador lado a lado de las cuentas del dueño, agrupadas por red. */
export function AccountComparator({ groups }: { groups: PlatformComparisonGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-400">
        Conecta cuentas para comparar su desempeño.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.platform} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <PlatformBadge platform={group.platform} />
            {group.accounts.length < 2 && (
              <span className="text-xs text-ink-400">Conecta otra cuenta de esta red para comparar.</span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.accounts.map((account) => (
              <div key={account.accountId} className="rounded-[--radius-card] border border-border bg-surface-1 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-ink-900">{account.label}</span>
                  {account.brand && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-400">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: account.brand.color }} />
                      {account.brand.name}
                    </span>
                  )}
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <Metric label="Engagement" value={pct(account.avgEngagementRate)} />
                  <Metric label="Contenido" value={String(account.contentCount)} />
                  <Metric
                    label="Seguidores"
                    value={account.followers !== null ? account.followers.toLocaleString("es") : "—"}
                  />
                </dl>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
