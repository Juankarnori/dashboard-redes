"use client";

import { useState, useTransition } from "react";
import { PlatformBadge } from "@/components/dashboard/PlatformBadge";
import { moveAccountToBrand } from "./actions";
import type { Database } from "@/types/db";

type Brand = Database["public"]["Tables"]["brands"]["Row"];
type Account = Database["public"]["Tables"]["accounts"]["Row"];
type BrandWithAccounts = Brand & { accounts: Account[] };

export function AccountsBoard({ brands }: { brands: BrandWithAccounts[] }) {
  const [, startTransition] = useTransition();
  const [movingId, setMovingId] = useState<string | null>(null);
  const [errorsByAccount, setErrorsByAccount] = useState<Record<string, string>>({});

  function handleMove(account: Account, targetBrandId: string) {
    if (!targetBrandId) return;
    setErrorsByAccount((prev) => ({ ...prev, [account.id]: "" }));
    setMovingId(account.id);
    startTransition(async () => {
      const result = await moveAccountToBrand(account.id, targetBrandId);
      setMovingId(null);
      if (result.error) {
        setErrorsByAccount((prev) => ({ ...prev, [account.id]: result.error! }));
      }
      // revalidatePath dentro del server action refresca el árbol de
      // Server Components de esta ruta (sin recargar el navegador), así
      // que `brands` llega ya actualizado — no hace falta tocar estado local.
    });
  }

  if (brands.length === 0) {
    return (
      <div className="rounded-[--radius-card] border border-dashed border-border bg-surface-1 px-8 py-16 text-center text-sm text-ink-600">
        Crea tu primer negocio arriba para empezar a conectar cuentas.
      </div>
    );
  }

  return (
    <>
      {brands.map((brand) => (
        <div key={brand.id} className="rounded-[--radius-card] border border-border bg-surface-1 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: brand.color }}
              />
              <h2 className="text-sm font-semibold text-ink-900">{brand.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/api/auth/meta/start?brand_id=${brand.id}`}
                className="inline-flex h-8 items-center justify-center rounded-[0.5rem] border border-border bg-surface-0 px-3 text-xs font-medium text-ink-900 transition-colors hover:bg-surface-2"
              >
                Conectar con Meta
              </a>
              <a
                href={`/api/auth/tiktok/start?brand_id=${brand.id}`}
                className="inline-flex h-8 items-center justify-center rounded-[0.5rem] border border-border bg-surface-0 px-3 text-xs font-medium text-ink-900 transition-colors hover:bg-surface-2"
              >
                Conectar con TikTok
              </a>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {brand.accounts.length === 0 ? (
              <p className="text-sm text-ink-400">Sin cuentas conectadas todavía.</p>
            ) : (
              brand.accounts.map((account) => {
                const otherBrands = brands.filter((b) => b.id !== brand.id);
                const hasLinkedChild = brand.accounts.some((a) => a.parent_account_id === account.id);
                const isPending = movingId === account.id;

                return (
                  <div
                    key={account.id}
                    className="flex flex-col gap-1 rounded-[0.5rem] border border-border bg-surface-0 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <PlatformBadge platform={account.platform} />
                        <span className="truncate text-sm text-ink-900">
                          {account.display_name ?? account.username ?? account.external_id}
                        </span>
                        {account.username && (
                          <span className="tabular shrink-0 text-xs text-ink-400">@{account.username}</span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        <span
                          className={
                            account.status === "active"
                              ? "text-xs font-medium text-positive"
                              : "text-xs font-medium text-negative"
                          }
                        >
                          {account.status === "active" ? "activa" : account.status}
                        </span>

                        {otherBrands.length > 0 && (
                          <select
                            aria-label={`Mover ${account.display_name ?? account.username ?? "cuenta"} a otro negocio`}
                            value=""
                            disabled={isPending}
                            onChange={(e) => handleMove(account, e.target.value)}
                            className="h-7 rounded-[0.4rem] border border-border bg-surface-1 px-2 text-xs text-ink-600 transition-colors hover:bg-surface-2 disabled:opacity-50"
                          >
                            <option value="" disabled>
                              {isPending ? "Moviendo…" : "Mover a…"}
                            </option>
                            {otherBrands.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    {errorsByAccount[account.id] && (
                      <p className="text-xs text-negative">{errorsByAccount[account.id]}</p>
                    )}
                    {hasLinkedChild && (
                      <p className="text-[0.7rem] text-ink-400">
                        Mover esta Página también mueve su Instagram vinculado.
                      </p>
                    )}
                    {account.parent_account_id && (
                      <p className="text-[0.7rem] text-ink-400">
                        Vinculada a una Página — se mueve de forma independiente.
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </>
  );
}
