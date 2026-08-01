"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Platform } from "@/types/db";

const PLATFORMS: { value: Platform; label: string }[] = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
];

export function FilterBar({ brands }: { brands: { id: string; name: string; color: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeBrand = searchParams.get("brand") ?? "all";
  const activePlatform = searchParams.get("platform") ?? "all";

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-5 sm:px-8">
      <FilterChip active={activeBrand === "all"} onClick={() => setParam("brand", "all")}>
        Todos los negocios
      </FilterChip>
      {brands.map((brand) => (
        <FilterChip
          key={brand.id}
          active={activeBrand === brand.id}
          onClick={() => setParam("brand", brand.id)}
          dotColor={brand.color}
        >
          {brand.name}
        </FilterChip>
      ))}

      <span className="mx-1 h-4 w-px bg-border" aria-hidden />

      <FilterChip active={activePlatform === "all"} onClick={() => setParam("platform", "all")}>
        Todas las redes
      </FilterChip>
      {PLATFORMS.map((p) => (
        <FilterChip
          key={p.value}
          active={activePlatform === p.value}
          onClick={() => setParam("platform", p.value)}
        >
          {p.label}
        </FilterChip>
      ))}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  dotColor,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-border bg-surface-1 text-ink-600 hover:bg-surface-2"
      )}
    >
      {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
      {children}
    </button>
  );
}
