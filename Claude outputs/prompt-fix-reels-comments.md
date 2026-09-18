# Prompt para Claude Code — dashboard-redes: BUG, faltan comentarios de Reels en la bandeja

> ⚠️ **Bug real, ya diagnosticado en vivo contra las cuentas reales.** Un comentario con intención de compra ("Número de contacto") en un Reel de Facebook **no aparece** en la bandeja de Comentarios de Social Pulse. Se están perdiendo leads calientes justamente en Reels, que es el contenido que más rinde. **No programes de una:** leé el sync actual, confirmá el diagnóstico de abajo con tu propia llamada, y **proponé el plan**. Esperá mi OK. Un commit por sub-parte, rama sobre la actual.

---

## Diagnóstico (verificado en vivo — replicalo antes de tocar código)

- El comentario **existe y la API lo devuelve**: `FACEBOOK_GET_COMMENTS { object_id: "1788458099212694" }` (Reel "Cajas Halloween 0,75 c/u") devuelve el comentario `"Número de contacto"` de Shirley Garcia, con id `122153897960403632_1408776964055867`, creado 2026-09-18T16:03:42Z. **No es un problema de permisos ni de token.**
- La causa es **cómo el sync enumera las publicaciones**. Hoy el sync de comentarios recorre las publicaciones del **feed** de la página vía `FACEBOOK_GET_PAGE_POSTS` (edge `/feed`) y por cada post baja los comentarios. **Ese Reel NO está en el feed**: pedí `FACEBOOK_GET_PAGE_POSTS { page_id: "352319327967547", limit: 30 }` y las 30 publicaciones más recientes (desde hoy hasta el 4-jul) **no incluyen** el Reel `1788458099212694` (ni "halloween", ni "0.75").
- Es **inconsistente**: algunos Reels SÍ entran al feed (los de flores amarillas, los de "Adivina el marcador"/Macará) y otros NO (este de Halloween), según cómo se publicaron. Facebook no garantiza que los Reels aparezcan en `/feed`. Como el sync solo mira el feed, **los comentarios de los Reels que quedan fuera del feed nunca se sincronizan** → no llegan a la bandeja ni al detector de leads.

**Confirmá vos mismo** antes de programar: corré esas dos llamadas (el `GET_COMMENTS` del Reel devuelve el comentario; el `GET_PAGE_POSTS` no lista ese Reel). Si no reproducís el diagnóstico, avisá y frená.

---

## Objetivo

Que el sync de comentarios de Facebook capture también los comentarios de **todos los Reels de la página**, no solo los del feed, y los pase por el mismo pipeline (clasificación de leads, estado pendiente/respondido, guardado, link al permalink). Con eso, un comentario como el de Shirley entra solo a la bandeja y queda marcado 🔥 Lead.

## Tareas

### 1. Enumerar Reels además de posts del feed
- En el sync de comentarios de FB (revisá `lib/analytics/comments-sync.ts` y la capa de proveedores `lib/platforms/facebook-composio.ts` / `lib/social/facebook.ts`), agregá una fuente de publicaciones que traiga los **Reels de la página**, no solo `FACEBOOK_GET_PAGE_POSTS`.
- **No inventes el slug**: usá `COMPOSIO_SEARCH_TOOLS` para descubrir si Composio expone un tool para Reels/videos de página (edge `/video_reels` o `/videos`). Si existe y sirve, routealo por ahí, con el mismo patrón `composio.tools.execute(slug, { userId, connectedAccountId, arguments })` y versiones de toolkit pinneadas (sin `dangerouslySkipVersionCheck`), como el resto del motor.
- Si Composio **no** tiene un tool para el edge de Reels, hacé la llamada Graph directa al edge `/{page_id}/video_reels` usando el **page access token** que ya provee la conexión (server-side, nunca en el cliente). Dejá comentado por qué (Composio no cubre ese edge).
- **Merge + dedupe:** combiná las publicaciones del feed con los Reels y deduplicá por id de objeto/media, porque algunos Reels aparecen en ambas fuentes — no bajes dos veces los comentarios del mismo objeto.

### 2. Bajar y mapear los comentarios de cada Reel
- Por cada Reel, `FACEBOOK_GET_COMMENTS { object_id: <id del reel> }` (verificado: el id del Reel de la URL, ej. `1788458099212694`, funciona como `object_id`).
- **Gotchas de ids (verificados):**
  - Un Reel tiene dos ids: el de la URL (`1788458099212694`) y el id de media interno (los comentarios vienen con id `122153897960403632_...`). Guardá el que te sirve para (a) volver a pedir comentarios y (b) construir el `permalink` del Reel para la bandeja.
  - El id de comentario es compuesto `mediaid_commentid` (ej. `122153897960403632_1408776964055867`). Para **responder** (`FACEBOOK_CREATE_COMMENT`), seguí usando el **id numérico simple del comentario** (el segmento después del último `_`), como ya quedó arreglado en Fase 3 — no el compuesto. Reusá esa misma lógica, no la dupliques.
- Mapealos al mismo shape que ya usa la bandeja (autor, texto, fecha, parentId, permalink al Reel) y pasalos por el mismo guardado/estado que los comentarios del feed.

### 3. Clasificación de leads
- Asegurate de que estos comentarios nuevos pasen por `lib/analytics/comment-classify.ts` y que **"número de contacto" / "contacto" / "número"** estén entre las keywords de intención de compra (el comentario real es literalmente "Número de contacto"). Si falta, agregalas. El resultado debe ser 🔥 Lead con respuesta sugerida en borrador (IA, voz de marca) — **nunca auto-enviada**.

### 4. Verificación en vivo (misma vara de siempre)
- Corré el sync con `tsx` contra la página real y confirmá que **el comentario "Número de contacto" de Shirley Garcia en el Reel `1788458099212694` ahora se sincroniza**, queda **pendiente** y marcado 🔥 Lead. Mostralo.
- `npm run lint`, `npx tsc --noEmit`, `npm run build` limpios en cada commit.
- Verificación visual con Playwright de la bandeja: el comentario del Reel aparece en "Pendientes" y en "Leads", con link al Reel.
- Limpiá cualquier artefacto de prueba.

## Restricciones
- No romper el sync actual del feed (los Reels son una fuente **adicional**). Fallback directo intacto. Rama nueva sobre la actual, un commit por sub-parte.
- `COMPOSIO_API_KEY` y tokens **solo server-side**. TypeScript estricto. Respetar el sistema de diseño "Centro de Redes", claro/oscuro, responsive.
- Ojo con el techo de llamadas del plan gratis: si sumar Reels dispara muchas llamadas, traé solo los Reels recientes (ej. últimos 60-90 días) y documentá el criterio.

## Cómo empezar
1. Reproducí el diagnóstico con tus propias llamadas (las dos de arriba).
2. Resumí cómo enumera hoy el sync las publicaciones de FB y dónde engancharías la fuente de Reels.
3. Proponé el plan (tool de Composio para Reels o Graph directo, merge/dedupe, dónde tocar) y esperá mi OK.
