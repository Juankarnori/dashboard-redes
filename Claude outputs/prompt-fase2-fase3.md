# Prompt para Claude Code — dashboard-redes: Fase 2 (Resumen/Analíticas) + Fase 3 (Escritura + Triggers)

> Continúa el proyecto `dashboard-redes`. La Fase 0 (rediseño "Centro de Redes") y la Fase 1 (motor Composio, solo lectura, en `lib/social/*` + tabla `composio_connections`) ya están hechas y verificadas en vivo contra las cuentas reales (Instagram, Facebook y TikTok cargan bien en `/settings/composio`).
> **No programes de una:** primero lee el estado actual y **propón el plan de la Fase 2** (archivos, cambios de BD, riesgos). Espera mi OK. Un commit/PR por fase. No rompas la integración directa (queda como fallback hasta que su equivalente Composio esté verificado).

---

## Antes de empezar (deuda técnica de la Fase 1 a saldar en Fase 2)

1. **Pinnear versiones de toolkit.** Hoy todos los `composio.tools.execute` usan `dangerouslySkipVersionCheck: true`. Antes de que la capa Composio sea el camino principal, configurar `toolkitVersions` en el cliente (`lib/social/client.ts`) con versiones concretas de los toolkits de Instagram/Facebook/TikTok, para no romper si Composio actualiza un toolkit. Quitar el skip.
2. **Bug de métrica de alcance (real, detectado en vivo).** En `getInstagramAccountInsights` el KPI de "Alcance (7D)" **suma los datapoints diarios** de `reach` (period=day). Eso infla el número: la pantalla muestra ~128 cuando el alcance único real de 7 días es ~21. El alcance diario NO se suma (una persona que vuelve varios días se cuenta varias veces). Arreglar: pedir el total del período con `metric_type: "total_value"` en `INSTAGRAM_GET_USER_INSIGHTS` (devuelve un `total_value.value` ya calculado), o si se deja la suma, renombrar el KPI a "Vistas acumuladas", no "Alcance". Revisar el mismo criterio en `getFacebookPageInsights` (ahí `page_follows` ya está bien resuelto como último valor; validar los diarios).

---

## Fase 2 — Resumen (KPIs) + Analíticas sobre la capa Composio

**Home / Resumen.**
- KPIs unificados de las 3 redes por negocio (Copiadora / Farmasi), leídos vía `lib/social/*`: seguidores totales, alcance/vistas 7d, interacciones 7d, publicaciones, cada uno con mini-tendencia (sparkline).
- Bloque **"Necesita tu atención"**: comentarios sin responder, leads calientes (ver Fase 3), borradores pendientes de aprobar.
- Selector de cuenta (ya existe en `/settings/composio`, reusar) + filtro por red.

**Analíticas.**
- Migrar el sync de métricas (`app/api/sync/route.ts`) para que lea por `lib/social/*` en vez de la integración directa, y persista snapshots diarios en Supabase (el cron de GitHub Actions ya existe).
- Tendencias en el tiempo (línea/área) desde los snapshots guardados; usar `useChartColors()` (ya creado en Fase 0) para que respeten claro/oscuro.
- Top publicaciones por engagement y por tipo/pilar; mejor hora para publicar (ya hay `BestTimeHeatmap`); crecimiento de seguidores.

---

## Fase 3 — Escritura + Triggers (la fase que mueve ventas)

**Capa de escritura en `lib/social/*`** (mismo patrón `userId + connectedAccountId` que la lectura):

- **Instagram:**
  - `INSTAGRAM_POST_IG_COMMENT_REPLIES` — responder comentarios (máx 300 chars, máx 4 hashtags, 1 URL, no todo mayúsculas).
  - `INSTAGRAM_CREATE_MEDIA_CONTAINER` + `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` — publicar reels/posts. Meta descarga el video/imagen desde una **URL pública**: usar la ruta proxy de Supabase Storage que ya existe (`app/api/media/[...path]`) — eso resuelve el requisito de URL pública.
  - `INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT` — chequear el límite de 24h antes de publicar en lote.
- **Facebook:**
  - `FACEBOOK_CREATE_COMMENT` — responder. **Gotcha confirmado en vivo:** el `object_id` del comentario debe ser el **id numérico simple** (ej. `1508941807918250`), NO el compuesto `postid_commentid` — con el compuesto Composio lo toma como page id y falla con "page not found". Guardar/derivar el id numérico al sincronizar comentarios.
  - `FACEBOOK_CREATE_POST` / `FACEBOOK_CREATE_VIDEO_POST` — publicar.
- **TikTok:** publicar sigue **bloqueado** hasta que la app en el TikTok Developer Console tenga aprobados `video.publish`/`video.upload` (el auth config actual solo pidió scopes de lectura, ver `connections.ts`). Dejar el composer en modo Draft para TikTok y mostrarlo claramente en la UI.

**Conectar a la UI existente:** enganchar `MultiPublishForm` / `CalendarItemPublishPanel` (publicar) y la bandeja de comentarios (`comments/*`, `ReplyForm`) a esta capa nueva, **siempre con paso de aprobación** antes de enviar/publicar.

**Composio Triggers — inbox de leads en tiempo real (lo de mayor retorno):**
- Configurar los **Triggers de Composio** para comentarios y menciones nuevos de Instagram y Facebook (revisar en `docs.composio.dev` y en el SDK — `composio.triggers.*` — qué triggers de IG/FB están disponibles y cómo se suscriben con webhook). Dejar de depender solo del polling del cron.
- Endpoint receptor: `app/api/webhooks/composio/route.ts` (validar la firma del webhook). Al llegar un comentario nuevo → clasificar reusando `lib/analytics/comment-classify.ts` → si es lead (keywords: *info, más info, precio, cuánto, cuánto cuesta, disponible, cómo pido, hacen…*) marcarlo **🔥 Lead** → notificar y redactar respuesta sugerida (Anthropic, en la voz de marca).
- Persistir el estado del comentario correctamente para **cerrar el bug viejo** de FB (comentarios respondidos que seguían "pendientes"): guardar el id de la respuesta y reconciliar contra la API.

---

## Restricciones técnicas

- No romper lo existente; integración directa como fallback hasta verificar cada equivalente Composio. Un commit por fase, rama `feature/composio-fase-2-3`.
- `COMPOSIO_API_KEY` y tokens **solo server-side**.
- TypeScript estricto. Cambios de esquema en Supabase → **SQL listo para pegar** en el SQL Editor, con explicación.
- Mantener la ruta proxy de medios. Respetar claro/oscuro, responsive, accesibilidad.
- Verificar cada pantalla nueva con Playwright. Usar los skills de diseño (Emil Kowalski / Impeccable / Taste) para el pulido visual, manteniendo el sistema "Centro de Redes".
- (Limpieza opcional) Todavía queda código de WhatsApp en el repo pese a haberlo dado de baja — decidir si se elimina en esta tanda o se deja.

## Cómo empezar

1. Resume el estado actual de `lib/social/*`, el sync y las pantallas afectadas.
2. Propón el plan de **Fase 2** (archivos, BD, riesgos) e incluye la deuda técnica de arriba (pin de versiones + fix de alcance).
3. Espera mi OK y arrancamos.
