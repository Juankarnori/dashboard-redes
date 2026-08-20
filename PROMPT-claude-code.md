# Prompt para Claude Code — Social Pulse

> Cómo usar: pégalo completo en Claude Code **o**, mejor, ve fase por fase (el bloque
> "Contexto" + una sola fase). Trabajar por fases da commits limpios y te deja revisar
> cada avance antes de seguir.

---

## Contexto del proyecto (léelo antes de tocar código)

**Social Pulse**: dashboard de un solo dueño para métricas, comentarios, publicación y
recomendaciones de Instagram, Facebook y TikTok.

- **Stack:** Next.js 16 (App Router) + TypeScript + Supabase (Postgres/Auth/Storage) + Tailwind v4 + Recharts. Desplegado en **Vercel plan Hobby**.
- **Sync:** GitHub Actions (`.github/workflows/sync.yml`) llama a `/api/sync` **una cuenta por invocación** (cabe en el timeout de 10s de Vercel Hobby).
- **Publicación:** ya existe (`src/app/(dashboard)/calendar/actions.ts` + migración `0008`): sube archivo a Supabase Storage, publica a Meta/TikTok, maneja el video asíncrono de Instagram con poll y el draft de TikTok.
- **Meta Graph API v22.0** (`META_GRAPH_API_VERSION`) — **no bajar**. Los insights fallan de forma **no fatal** (`console.warn`, el sync sigue).

### ⚠️ RESTRICCIÓN CLAVE — TODO GRATIS (léela con atención)

Este proyecto debe funcionar **sin ninguna API de pago**. En concreto:

- **No usar la API de Anthropic/Claude** (consume créditos). **Toda la "inteligencia"** de este prompt (clasificar comentarios, redactar reportes) se hace con **reglas y estadística en TypeScript**, sin LLM.
- La app ya tiene 3 usos de la API de Claude (ideas, copys de promoción y tendencias) en `src/app/(dashboard)/recommendations/actions.ts`, todos detrás de `if (process.env.ANTHROPIC_API_KEY)`. **No configures `ANTHROPIC_API_KEY`**: así esas funciones no corren y no hay costo (ver Fase 0.4 para que la UI degrade limpio).
- Mantente dentro de los tiers gratuitos: **Vercel Hobby** (timeout 10s, 1 cron nativo/día → por eso el sync usa GitHub Actions), **Supabase Free**, **GitHub Actions** gratis. Nada de servicios que facturen por uso.

### Antes de escribir código, LEE y respeta los patrones de:
`README.md`, `AGENTS.md`, `src/app/api/sync/route.ts`, `.github/workflows/sync.yml`,
`src/app/(dashboard)/calendar/actions.ts`, `src/lib/analytics/*` (queries, alerts,
comments-sync, engagement, recommendations), `src/lib/platforms/*` (un provider por red +
`types.ts`), `src/types/db.ts`, `src/app/(dashboard)/comments/*`, y las migraciones en
`supabase/migrations/` (la última es `0008`; las nuevas empiezan en `0009` y suben de a una).

### Reglas de oro (para todas las fases)
1. Sigue las convenciones existentes (un provider por red, migraciones SQL numeradas, sync por-cuenta).
2. **No rompas el timeout de 10s de Vercel Hobby:** trabajo pesado en su propio `scope`/endpoint invocado por-cuenta o en lotes chicos.
3. **Cero APIs de pago.** Si algo pareciera necesitar una, para y avísame en vez de improvisar.
4. Nunca commitees secretos. Si falta una credencial, deja un `TODO` documentado en README y `.env.local.example`.
5. Al final de **cada fase**: `npm run lint` + `npm run build`, arregla lo que falle, y **un commit por fase** con mensaje claro.
6. Empieza proponiéndome un **plan corto** de cada fase antes de programar.

---

## Fase 0 — Arreglos + cortar el gasto de créditos

**0.1 — Los comentarios casi nunca se sincronizan.** El `scope=comments` de `/api/sync`
existe y `syncCommentsForAccount` funciona, pero **ningún cron lo dispara** (`sync.yml`
solo corre `all` y `stories`).
- En `.github/workflows/sync.yml`: agrega un tercer cron `*/30 * * * *` y, en el step "Determinar scope", mapéalo a `comments` (patrón igual al de `stories`). Suma `comments` como opción del `workflow_dispatch`.

**0.2 — Botón "Actualizar ahora" en la bandeja de comentarios.**
- En `src/app/(dashboard)/comments/`: botón que dispare una server action que ejecute `syncCommentsForAccount` para las cuentas activas del dueño, con estado de carga y refresco de la lista al terminar. Reutiliza la lógica existente, no la dupliques.

**0.3 — Métricas más frescas.**
- En `sync.yml`, cambia el cron de `scope=all` de `0 */4 * * *` a `0 * * * *` (cada hora).

**0.4 — Cortar el consumo de créditos de Claude.**
- Verifica que con `ANTHROPIC_API_KEY` **sin definir**, la página `/recommendations` degrada limpio (ya hay checks en `recommendations/actions.ts` ~líneas 73/132/207 — que no lancen error visible feo; muestra un aviso tipo "función de IA desactivada").
- **Opcional (para no perder la función sin pagar):** reemplaza `generateContentIdeas` por un generador de ideas **basado en plantillas + los datos ya calculados** (mejor formato, mejor hora, top posts) — sin LLM. Ej.: "Repetí el formato {tipo} que te da {er}% de engagement, publicando {día} a las {hora}."

---

## Fase 1 — Clasificar comentarios por reglas (sentimiento + leads), SIN IA de pago

Priorizar ventas y quejas clasificando cada comentario con **lógica en TypeScript**, sin LLM.

- **Migración `0009_*`:** en `comments` agrega `sentiment text` (`positive|negative|question|spam|lead|neutral`), `intent_score int` (0-100) y `classified_at timestamptz`.
- **Nuevo módulo `src/lib/analytics/comment-classify.ts`:** función pura (texto → `{sentiment, score}`) con léxicos en español, exportados como constantes **editables**:
  - **lead:** `precio, cuánto, cuesta, vale, comprar, disponible, stock, hay, envío, delivery, cotiza, info, interesa, quiero, pedido, wsp/whatsapp, dm, número, contacto` — o `"?"` junto a una palabra comercial. `intent_score` sube con la densidad de estas señales.
  - **question:** contiene `"?"` o empieza con `qué/cómo/cuándo/cuánto/dónde`.
  - **negative:** `malo, pésimo, estafa, no sirve, horrible, decepción, tarde, no llegó, reembolso` o emojis negativos.
  - **spam:** contiene URL/enlace, `sígueme/followback/gana dinero`, o texto repetido.
  - **positive:** `me encanta, hermoso, excelente, gracias` o emojis 🔥❤️👏.
  - default **neutral**.
- **Enganche:** clasifica lo no clasificado al final del `scope=comments`. Es solo CPU (sin red) → cabe sobrado en 10s.
- **UI:** badge de sentimiento en `CommentInboxRow.tsx`, filtro por tipo (destacando `lead` y `negative`), y orden con los leads primero.

---

## Fase 2 — Análisis por formato, mejor hora y comparación de cuentas (SQL, gratis)

- En `src/lib/analytics/queries.ts` (o módulo nuevo) agrega queries para: engagement promedio **por tipo** (reel/carrusel/imagen/historia), **por hora × día de semana** (para heatmap), y **comparativa entre las 2 cuentas** del mismo dueño por red.
- Usa la **misma definición de engagement** que ya está en `src/lib/analytics/engagement.ts` (reutilízala, no inventes otra fórmula).
- **UI:** heatmap de mejores horas, gráfico/tabla por formato y comparador lado a lado. Recharts + `src/lib/chart-theme.ts`.

---

## Fase 3 — Alertas de contenido que despega (estadística, gratis)

- Amplía `src/lib/analytics/alerts.ts`:
  - **Despega:** por cada contenido reciente, compara su engagement/alcance contra la **media + k·desv** de la cuenta en una ventana de N días (k≈2). Si la supera → alerta "despegando → considéralo para anuncio".
  - **Caída:** si el alcance promedio de los últimos X posts cae por debajo de Y% del promedio previo → alerta.
- Guarda en la tabla `alerts` con `type` nuevos. Umbrales (`N`, `k`, `X`, `Y`) en constantes configurables. Muéstralas donde ya se rendericen alertas.

---

## Fase 4 — Reporte semanal por plantilla (SIN IA), gratis

- **Nuevo módulo `weekly-report.ts`:** toma las queries de la semana vs la anterior y arma el texto con **plantillas de string** (nada de LLM). Ej.: *"Del {a} al {b}: publicaste {n} piezas. Alcance total {x} ({±}% vs semana previa). Mejor post: '{caption}' ({er}% engagement). Formato ganador: {tipo}. Mejor hora: {hora}. Comentarios sin responder: {k} (leads: {l})."*
- **Migración `00XX_*`:** tabla `reports` (brand_id, week_start, body, metrics jsonb).
- **Endpoint** `POST /api/reports/weekly` protegido con `SYNC_CRON_SECRET`; cron semanal (lunes) en el workflow.
- **UI:** sección "Reportes" (lista + detalle).
- **Email (opcional, gratis):** si quieres que llegue por correo, déjalo preparado con un proveedor de **tier gratuito** (p. ej. Resend free) como env var **opcional**; si no está configurada, el reporte solo se ve en la UI. **No inventes credenciales.**

---

## Fase 5 — WhatsApp: bandeja para recibir y responder a mano (Cloud API)

Integrar **WhatsApp Cloud API** de Meta para leer y responder desde el dashboard.
**Sin auto-respuesta** en esta fase.

> **Costo:** recibir mensajes y responder dentro de la ventana de servicio de 24h es
> **gratis e ilimitado** (conversaciones de servicio, desde nov. 2024). Solo cuestan las
> plantillas proactivas/marketing — que aquí **no** se usan. Este uso es gratis.

- **Migración `00XX_*`:** `whatsapp_conversations(id, contact_wa_id, contact_name, last_message_at)` y `whatsapp_messages(id, conversation_id, wa_message_id unique, direction 'in'|'out', body, msg_type, status, sent_at)`. Canal aparte, no lo metas en el modelo de `content`.
- **Webhook `src/app/api/webhooks/whatsapp/route.ts`:**
  - `GET`: valida `hub.mode` + `hub.verify_token` (contra `WHATSAPP_WEBHOOK_VERIFY_TOKEN`) y responde `hub.challenge`.
  - `POST`: parsea `entry[].changes[].value.messages[]` y `contacts[]`, hace upsert de la conversación y guarda el mensaje entrante.
- **Envío:** `POST https://graph.facebook.com/v22.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` con `{messaging_product:'whatsapp', to, type:'text', text:{body}}`. **Solo dentro de la ventana de 24h**; si está cerrada, la UI avisa que no se puede responder (no recurras a plantillas de pago).
- **UI:** sección "WhatsApp" en el `Sidebar`, bandeja tipo chat para leer y responder.
- **Env vars** (documentar en README y `.env.local.example`, sin valores): `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
- **README:** pasos de setup en Meta (WhatsApp Business Account, número dedicado, permiso `whatsapp_business_messaging`). Límites: los **estados no se publican por API**; la difusión masiva requiere plantillas (de pago) y queda **fuera de alcance**.

---

## Fase 6 — Publicar una vez → todas las redes (con carrusel)

**Contexto:** la publicación **ya existe** (`src/app/(dashboard)/calendar/actions.ts` +
`0008_calendar_publishing.sql`), pero hoy es **1 cuenta + 1 archivo por pieza** y **sin
carrusel**. Esta fase la convierte en "adjunto una vez, elijo varias redes, publico a
todas" y agrega carrusel. **Reutiliza `attachCalendarMedia`, `startPublish`,
`pollPublishStatus`, el patrón container+poll de Instagram y el `draft_sent` de TikTok —
no lo reescribas.** Todo esto es gratis (solo llama a las APIs de Meta/TikTok).

**Objetivo de UI:** un formulario donde el dueño adjunta **un video O varias imágenes
(carrusel)** + un texto, marca **varias cuentas destino** (sus 2 FB, 2 IG, 2 TikTok) y
publica a todas, viendo el estado por red.

**Multi-destino (fan-out):**

- **Migración `00XX_*`:** agrega `post_group_id uuid` a `content_calendar` para agrupar las piezas del mismo formulario.
- Al enviar, crea **una fila de `content_calendar` por cuenta destino** con el mismo `post_group_id`, `caption` y archivo(s). Publica reutilizando `startPublish`/`pollPublishStatus` **por fila**, **una cuenta por invocación** (timeout Hobby).
- **Fallo por-fila, no por-grupo:** si una red falla, las demás siguen. La UI muestra el estado de cada red del grupo.

**Carrusel (varias imágenes):**

- **Migración:** múltiples medios por pieza con `media_paths text[]` (o tabla hija con orden). **Mantén** `media_path`/`media_type` para no romper lo single.
- Extiende `provider.publishContent` y los tipos en `src/lib/platforms/types.ts` para aceptar un arreglo de medios:
  - **Instagram:** child container por imagen (`is_carousel_item=true`) → container `CAROUSEL` con `children` → publish, con el patrón asíncrono container+poll ya existente. Máx. 10 elementos.
  - **Facebook:** post multi-foto (cada foto con `published=false` + `attached_media`).
  - **TikTok:** modo foto (photo carousel) de la Content Posting API, o video single; mantén el flujo `draft_sent`.
- El proxy de TikTok (`/api/media`, dominio verificado) aplica a **cada** imagen; Meta usa la URL directa de Storage.

---

## Cierre

- Actualiza `README.md` con las features nuevas, env vars y pasos de setup (WhatsApp).
- Confirma que `npm run lint` y `npm run build` pasan.
- **Un commit por fase**, mensajes claros.
- **Cero APIs de pago, cero secretos commiteados.** Si algo no cuadra con este plan, avísame antes de improvisar.
