import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY no está definida.");
  }
  return new Anthropic({ apiKey });
}

export interface TopPostSummary {
  caption?: string;
  type: string;
  platform: string;
  engagementRatePct: number;
}

export interface ContentIdea {
  title: string;
  body: string;
}

export interface TrendSummary {
  topic: string;
  summary?: string;
}

/**
 * Genera ideas de contenido nuevas para un negocio, usando sus posts de
 * mejor desempeño histórico y (si hay) tendencias actuales de su nicho
 * como referencia de qué funciona y qué es oportuno ahora.
 */
export async function generateContentIdeas(
  brandName: string,
  topPosts: TopPostSummary[],
  trends: TrendSummary[] = []
): Promise<ContentIdea[]> {
  const client = getClient();

  const postsSummary = topPosts
    .map(
      (p, i) =>
        `${i + 1}. [${p.platform}/${p.type}] engagement ${p.engagementRatePct.toFixed(1)}% — "${
          p.caption?.slice(0, 140) ?? "(sin descripción)"
        }"`
    )
    .join("\n");

  const trendsSummary = trends
    .map((t, i) => `${i + 1}. ${t.topic}${t.summary ? ` — ${t.summary}` : ""}`)
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Eres un estratega de contenido para redes sociales del negocio "${brandName}".

Estas son sus publicaciones históricas con mejor desempeño (mayor engagement rate):
${postsSummary || "(todavía no hay suficiente historial)"}

Estas son tendencias actuales relevantes a su nicho (usalas para ángulos oportunos y
de actualidad, no solo para repetir lo que ya funcionó antes):
${trendsSummary || "(sin tendencias cargadas — proponé igual en base al historial)"}

A partir de los patrones que veas en el historial (formato, tono, tema) y de las
tendencias actuales, propone 5 ideas de contenido nuevas y concretas para las próximas
semanas. Cada idea debe tener un título corto y una descripción de 1-2 frases explicando
qué publicar y por qué debería funcionar.

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, con este formato:
[{"title": "...", "body": "..."}, ...]`,
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parseIdeas(text);
}

function parseIdeas(text: string): ContentIdea[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("Claude no devolvió un JSON reconocible.");
  }
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Formato inesperado de Claude.");
  return parsed
    .filter((item) => typeof item?.title === "string" && typeof item?.body === "string")
    .map((item) => ({ title: item.title, body: item.body }));
}

export interface PromotionVariant {
  platform: string;
  title: string;
  body: string;
}

/**
 * Genera variantes de copy de promoción para un producto/servicio,
 * adaptadas a cada red donde el negocio tiene cuentas conectadas,
 * usando su historial de mejor desempeño como referencia de tono/formato.
 */
export async function generatePromotionVariants(
  brandName: string,
  product: string,
  objective: string,
  platforms: string[],
  topPosts: TopPostSummary[]
): Promise<PromotionVariant[]> {
  const client = getClient();

  const postsSummary = topPosts
    .map(
      (p, i) =>
        `${i + 1}. [${p.platform}/${p.type}] engagement ${p.engagementRatePct.toFixed(1)}% — "${
          p.caption?.slice(0, 140) ?? "(sin descripción)"
        }"`
    )
    .join("\n");

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Eres copywriter de marketing para el negocio "${brandName}".

Vas a promocionar: ${product}
Objetivo de la promoción: ${objective}
Redes donde se va a publicar: ${platforms.join(", ")}

Estas son las publicaciones históricas con mejor desempeño del negocio, como referencia
de qué tono y formato funcionan mejor:
${postsSummary || "(todavía no hay suficiente historial)"}

Genera entre 3 y 5 variantes de copy listas para publicar, adaptadas a cada red indicada
(al menos una variante por cada red listada arriba). Cada variante tiene un título corto
(referencia interna, no se publica) y el texto completo del post ("body"), en español,
con el tono que mejor funcionó históricamente para este negocio.

Responde ÚNICAMENTE con un array JSON válido, sin texto adicional, con este formato:
[{"platform": "instagram", "title": "...", "body": "..."}, ...]`,
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parsePromotionVariants(text);
}

function parsePromotionVariants(text: string): PromotionVariant[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("Claude no devolvió un JSON reconocible.");
  }
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Formato inesperado de Claude.");
  return parsed
    .filter(
      (item) =>
        typeof item?.platform === "string" &&
        typeof item?.title === "string" &&
        typeof item?.body === "string"
    )
    .map((item) => ({ platform: item.platform, title: item.title, body: item.body }));
}

export interface TrendResult {
  topic: string;
  summary: string;
  sourceUrl?: string;
}

/**
 * Busca tendencias/hashtags actuales relevantes al nicho de un negocio
 * usando el Web Search Tool nativo de la API (server-side — Claude corre
 * la búsqueda y devuelve el resultado final en la misma llamada).
 */
export async function fetchTrendingTopics(brandName: string, niche: string): Promise<TrendResult[]> {
  const client = getClient();

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [
      {
        role: "user",
        content: `Eres un investigador de tendencias de redes sociales para el negocio "${brandName}",
cuyo nicho es: ${niche}.

Buscá en la web temas, hashtags o eventos en tendencia AHORA que sean relevantes para
este nicho y que valga la pena aprovechar para contenido en Instagram/Facebook en los
próximos días (fechas del calendario, temporadas, noticias del sector, tendencias virales
del nicho, etc. — no genéricas de redes sociales en general).

Después de buscar, respondé ÚNICAMENTE con un array JSON de 3 a 6 tendencias, sin texto
adicional, con este formato:
[{"topic": "...", "summary": "por qué es relevante y cómo aprovecharla, 1-2 frases", "source_url": "..."}, ...]`,
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parseTrends(text);
}

function parseTrends(text: string): TrendResult[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("Claude no devolvió un JSON reconocible.");
  }
  const parsed = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("Formato inesperado de Claude.");
  return parsed
    .filter((item) => typeof item?.topic === "string" && typeof item?.summary === "string")
    .map((item) => ({
      topic: item.topic,
      summary: item.summary,
      sourceUrl: typeof item?.source_url === "string" ? item.source_url : undefined,
    }));
}
