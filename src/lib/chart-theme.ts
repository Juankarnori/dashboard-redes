"use client";

import { useSyncExternalStore } from "react";

/**
 * Colores para Recharts. Los tokens de diseño viven como CSS vars en
 * globals.css, pero Recharts dibuja SVG plano — para que el color se
 * vea igual en todos los navegadores los espejamos acá como hex fijos,
 * uno por tema (ver useChartColors() más abajo para elegir el correcto
 * en vivo, incluido el toggle manual de ThemeToggle.tsx).
 */
const LIGHT = {
  accent: "#6c4ae0",
  accentSoft: "#a996ee",
  live: "#c67c0b",
  positive: "#12904a",
  negative: "#c43c77",
  info: "#2563c9",
  grid: "#e7e1f2",
  axis: "#928cab",
} as const;

const DARK = {
  accent: "#a78bf7",
  accentSoft: "#8064c9",
  live: "#e7b85a",
  positive: "#5fcb8b",
  negative: "#e883ae",
  info: "#7fa6f0",
  grid: "#332a49",
  axis: "#756d92",
} as const;

export type ChartColors = Record<keyof typeof LIGHT, string>;

/** Mismo esquema light/dark para las 3 redes, coherente con PlatformBadge. */
const PLATFORM_COLORS_LIGHT: Record<string, string> = {
  instagram: "#c43c77",
  facebook: "#2563c9",
  tiktok: "#1e1a2b",
};

const PLATFORM_COLORS_DARK: Record<string, string> = {
  instagram: "#e883ae",
  facebook: "#7fa6f0",
  tiktok: "#f2eefb",
};

function getSnapshot(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);

  // El toggle manual cambia data-theme en <html> sin recargar la
  // página — un MutationObserver es la forma correcta de enterarse
  // desde un componente que no es el que hizo el cambio.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return () => {
    mql.removeEventListener("change", onChange);
    observer.disconnect();
  };
}

/**
 * Colores de charts reactivos al tema actual — sigue tanto el toggle
 * manual (atributo data-theme, ver ThemeToggle.tsx) como el cambio de
 * preferencia del sistema si no hay override manual. Los charts solo se
 * montan en el cliente (Recharts no hace SSR real), así que el
 * getServerSnapshot cae en "light" sin causar flash perceptible.
 */
export function useChartColors(): ChartColors & { platform: Record<string, string> } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light" as const);

  const colors = theme === "dark" ? DARK : LIGHT;
  const platform = theme === "dark" ? PLATFORM_COLORS_DARK : PLATFORM_COLORS_LIGHT;
  return { ...colors, platform };
}
