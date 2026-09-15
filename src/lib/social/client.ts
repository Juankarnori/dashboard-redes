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
 */
let client: Composio | null = null;

export function getComposioClient(): Composio {
  if (client) return client;

  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    throw new Error(
      "COMPOSIO_API_KEY no está definida. Conseguila en https://app.composio.dev y agregala a .env.local (y a Vercel para producción)."
    );
  }

  client = new Composio({ apiKey });
  return client;
}
