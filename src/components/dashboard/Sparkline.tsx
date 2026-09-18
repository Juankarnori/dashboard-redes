/**
 * Mini gráfico de línea inline, sin dependencias (no vale la pena
 * recharts/ResponsiveContainer para esto) — usado dentro de StatTile.
 * `currentColor` para heredar el color de texto del contenedor sin
 * pasar un color a mano por cada red/tema.
 */
export function Sparkline({ data, width = 72, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // evita división por 0 cuando todos los valores son iguales
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="text-accent opacity-70"
      aria-hidden
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
