import { Composio } from "@composio/core";

/**
 * Cliente Composio, server-side únicamente — nunca importar este módulo
 * desde un client component. COMPOSIO_API_KEY vive solo en variables de
 * entorno (Vercel + .env.local), nunca se expone al navegador.
 *
 * `composio.tools.execute(slug, { connectedAccountId, arguments })` es
 * el método correcto para ejecutar UNA tool conocida (verificado leyendo
 * node_modules/@composio/core/src/models/Tools.ts directamente — los
 * docs scrapeados no eran 100% consistentes entre sí, así que se
 * confirmó contra el código fuente real del SDK instalado, versión
 * 0.18.1). `composio.sessions`/`composio.create` es un patrón distinto
 * (Tool Router / MCP para agentes conversacionales) que no aplica acá:
 * nosotros siempre sabemos de antemano qué tool ejecutar.
 *
 * `toolkitVersions`: versiones pinneadas al 2026-09-15 (las más nuevas
 * disponibles ese día, consultadas en vivo con `composio.toolkits.get(slug)`
 * — no inventadas). Sin esto, Composio resuelve a "latest" en cada
 * llamada y exige `dangerouslySkipVersionCheck: true` para no tirar
 * `ComposioToolVersionRequiredError` (ver Tools.ts, executeComposioTool);
 * pinnear versiones concretas evita que un toolkit nuevo de Composio
 * cambie de forma silenciosa la forma de una respuesta que ya
 * parseamos a mano (ver lib/social/instagram.ts, facebook.ts, tiktok.ts).
 * Para subir de versión: volver a consultar `toolkits.get(slug)`,
 * revisar el changelog de esa versión, probar en vivo, recién ahí subir
 * el string acá.
 */
const TOOLKIT_VERSIONS: Record<string, string> = {
  instagram: "20260915_00",
  facebook: "20260902_00",
  tiktok: "20260817_00",
};

let client: Composio | null = null;

export function getComposioClient(): Composio {
  if (client) return client;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "COMPOSIO_API_KEY no está definida. Conseguila en https://app.composio.dev y agregala a .env.local (y a Vercel para producción)."
    );
  }

  client = new Composio({ apiKey, toolkitVersions: TOOLKIT_VERSIONS });
  return client;
}
