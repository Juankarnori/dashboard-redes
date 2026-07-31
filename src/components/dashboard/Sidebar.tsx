"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(dashboard)/actions";

const NAV_ITEMS = [
  { href: "/", label: "Resumen" },
  { href: "/content", label: "Contenido" },
  { href: "/calendar", label: "Calendario" },
  { href: "/recommendations", label: "Recomendaciones" },
  { href: "/settings/accounts", label: "Cuentas" },
];

export function MobileTopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-1 px-4 py-3 lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="inline-flex h-9 w-9 items-center justify-center rounded-[0.5rem] border border-border bg-surface-0 text-ink-600 transition-colors hover:bg-surface-2"
      >
        <Menu size={18} />
      </button>
      <span className="text-sm font-semibold tracking-tight text-ink-900">
        Social <span className="font-mono text-accent">Pulse</span>
      </span>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  // Bloquea el scroll de fondo y permite cerrar con Escape mientras el
  // drawer está abierto en mobile — en desktop `open` no se usa (siempre visible).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface-1 px-3 py-5",
          "transition-transform duration-200 ease-out lg:static lg:translate-x-0 lg:transition-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <span aria-hidden className="pulse-dot h-1.5 w-1.5 rounded-full bg-live" />
            <span className="text-sm font-semibold tracking-tight text-ink-900">
              Social <span className="font-mono text-accent">Pulse</span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[0.4rem] text-ink-400 transition-colors hover:bg-surface-2 hover:text-ink-900 lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "rounded-[0.5rem] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-accent-strong"
                    : "text-ink-600 hover:bg-surface-2 hover:text-ink-900"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-[0.5rem] px-3 py-2 text-left text-sm text-ink-400 transition-colors hover:bg-surface-2 hover:text-ink-900"
          >
            Cerrar sesión
          </button>
        </form>
      </aside>
    </>
  );
}
