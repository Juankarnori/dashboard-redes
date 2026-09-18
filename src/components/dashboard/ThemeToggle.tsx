"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme") as Theme | null;
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);
  // El toggle cambia data-theme en <html> sin recargar — un
  // MutationObserver es la forma correcta de enterarse desde acá.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mql.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/**
 * Toggle claro/oscuro manual. El estado real vive en el atributo
 * data-theme de <html> (ya fijado antes de hidratar por el script inline
 * en layout.tsx, si había una preferencia guardada) — este componente
 * solo lo lee/escribe, para no duplicar la fuente de verdad.
 * useSyncExternalStore en vez de useEffect+useState: es la forma
 * correcta de leer un valor que vive fuera de React (DOM, matchMedia)
 * sin el anti-patrón de "setState síncrono dentro de un efecto" — y de
 * paso resuelve el mismatch de SSR (getServerSnapshot=null) sin flash.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getSnapshot, () => null);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage bloqueado (modo privado, etc.) — el toggle igual funciona para esta sesión.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.5rem] text-ink-400 transition-colors hover:bg-surface-2 hover:text-ink-900"
    >
      {theme === null ? (
        <span className="h-4 w-4" aria-hidden />
      ) : theme === "dark" ? (
        <Sun size={16} />
      ) : (
        <Moon size={16} />
      )}
    </button>
  );
}
