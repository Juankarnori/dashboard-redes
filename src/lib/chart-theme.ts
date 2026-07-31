/**
 * Colores para Recharts. Los tokens de diseño viven como CSS vars en
 * globals.css, pero Recharts dibuja SVG plano — para que el color se
 * vea igual en todos los navegadores lo espejamos aquí como hex fijos
 * (modo claro; ver nota en globals.css sobre la paleta "Signal").
 */
export const CHART_COLORS = {
  accent: "#12615f",
  accentSoft: "#8fc4c1",
  live: "#e8850c",
  positive: "#3f7d4f",
  negative: "#c1432e",
  grid: "#e3e2da",
  axis: "#93948a",
} as const;

export const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#c1432e",
  facebook: "#12615f",
  tiktok: "#5b5c52",
};
