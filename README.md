# Social Pulse

Dashboard de un solo dueño para métricas, comentarios, publicación y
recomendaciones de Instagram, Facebook y TikTok. Todo funciona sin
ninguna API de pago (ver "Restricción clave" más abajo) — la única
excepción opcional es Claude para 3 funciones puntuales de IA en
`/recommendations`, apagadas por default.

Stack: Next.js 16 (App Router) + TypeScript + Supabase (Postgres/Auth/Storage) +
Tailwind CSS v4 + Recharts. Desplegado en Vercel (plan Hobby); sync por
GitHub Actions (Vercel Hobby limita el cron nativo a 1x/día).

## Restricción clave: todo gratis

- **Sin `ANTHROPIC_API_KEY`** el dashboard funciona igual: `/recommendations`
  muestra un aviso de "función de IA desactivada" en vez de un error técnico,
  y el resto (mejor horario/formato calculado en TS, alertas, reportes,
  clasificación de comentarios) no depende de eso en absoluto.
- Todo lo demás corre dentro de tiers gratuitos: Vercel Hobby, Supabase Free,
  GitHub Actions gratis, WhatsApp Cloud API (conversaciones de servicio,
  gratis e ilimitadas dentro de la ventana de 24h).

## Estado del proyecto

Todas las fases están implementadas en código. Lo que **no** está hecho
todavía es probarlas contra cuentas reales de Meta/TikTok y un proyecto de
Supabase real — eso requiere que completes el setup de la sección 1 y
corras las migraciones nuevas (`0009` a `0013`).

- **Fase 1 — Setup y autenticación** ✅ — esquema de BD, login del dueño
  (Supabase Auth), OAuth de Meta (Pages + su Instagram Business vinculado) y
  de TikTok, agrupadas por "negocio" (`brands`).
- **Fase 2 — Sync de métricas** ✅ — `/api/sync`, un provider por red
  (Instagram/Facebook/TikTok), GitHub Actions cada hora (+ historias cada
  hora, comentarios cada 30 min).
- **Fase 3 — Dashboard** ✅ — resumen, galería de contenido, detalle con
  evolución, comparador de cuentas y heatmap de mejor horario (`/analytics`).
- **Fase 4 — Recomendaciones** ✅ — mejor horario/formato en TS + ideas con
  Claude (opcional).
- **Comentarios** ✅ — bandeja centralizada (`/comments`) con clasificación
  por reglas (sentimiento + intención de compra, sin IA — ver
  `lib/analytics/comment-classify.ts`), respuesta individual y masiva.
- **Alertas** ✅ — caída de engagement, racha sin publicar, contenido que
  despega (estadística: media + k·desvío) y caída de alcance.
- **Reportes semanales** ✅ — `/reports`, por plantilla de string (sin IA),
  generado por cron los lunes.
- **WhatsApp** ✅ — `/whatsapp`, bandeja de lectura/respuesta manual vía
  WhatsApp Cloud API (sin auto-respuesta).
- **Calendario y publicación** ✅ — `/calendar`, publicación real a Meta/
  TikTok con soporte de carrusel y fan-out a varias cuentas a la vez.

⚠️ Los nombres de métricas de insights de la Graph API de Meta (`lib/meta/instagram.ts`,
`lib/meta/facebook.ts`) están escritos contra **Graph API v22.0** (`META_GRAPH_API_VERSION`
en `.env.local`, no bajar de esa versión), pero **no se han probado contra cuentas reales
todavía** — Meta cambia estos nombres con cierta frecuencia. Si `/api/sync` devuelve
métricas vacías para una cuenta, revisa los `console.warn` del log (los insights fallan
de forma no fatal) y ajusta las listas de métricas contra
[Graph API Explorer](https://developers.facebook.com/tools/explorer/).

Dos cosas ya manejadas explícitamente por el código:
- **`impressions`/`video_views` deprecados**: Instagram unificó todo en la métrica
  `views` (posts, reels e historias); `lib/platforms/instagram.ts` la mapea a la
  columna `impressions` de `content_metrics`. Facebook no tiene un `views` unificado
  documentado — se dejó `post_impressions_unique` (reach) como base y
  `post_video_views` solo para posts de video; verifícalo contra una Page real.
- **Cuentas de Instagram con menos de 1,000 seguidores**: Meta no expone insights de
  engagement por debajo de ese umbral. `checkEngagementEligibility` lo detecta una vez
  por cuenta antes de pedir insights (evita llamadas que sabemos que van a fallar) y
  loguea un warning claro; el sync sigue guardando conteos básicos (likes/comments del
  endpoint de media) en vez de fallar.

## 1. Setup local

```bash
npm install
cp .env.local.example .env.local
```

Rellena `.env.local`:

| Variable | De dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `META_APP_ID`, `META_APP_SECRET` | Ya los tienes (Meta for Developers) |
| `META_TOKEN_ENCRYPTION_KEY` | Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` en local |
| `SYNC_CRON_SECRET` | Cualquier string aleatorio (protege `/api/sync`) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Fase 4 — [console.anthropic.com](https://console.anthropic.com); modelo por defecto `claude-sonnet-5` |

### Base de datos

Corre la migración en tu proyecto de Supabase:

```bash
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

(o pega el contenido de `supabase/migrations/0001_init.sql` directamente en
el SQL Editor del dashboard de Supabase).

### Crear tu usuario (dueño de la app)

No hay registro público por diseño — es un dashboard de un solo dueño.
Crea tu usuario desde Supabase → Authentication → Users → "Add user"
(email + password), y usa esas credenciales en `/login`.

### App de Meta — Redirect URI

La Redirect URI configurada en Meta debe ser exactamente:

```
http://localhost:3000/api/auth/callback/meta
```

En producción, agrega también `https://tu-dominio.vercel.app/api/auth/callback/meta`
y actualiza `NEXT_PUBLIC_APP_URL` en Vercel.

Permisos (scopes) que pide el flujo: `pages_show_list`,
`pages_read_engagement`, `pages_manage_metadata`, `read_insights`,
`instagram_basic`, `instagram_manage_insights`. Tu app de Meta debe tener
acceso aprobado a estos (o estar en modo desarrollo con tu propio usuario
como tester, que es suficiente para empezar).

```bash
npm run dev
```

## 2. Cómo funciona la conexión de cuentas (Fase 1)

1. En `/settings/accounts` creas un "negocio" (`brands`).
2. Click en "Conectar con Meta" → `/api/auth/meta/start?brand_id=...` guarda
   un nonce anti-CSRF en una cookie y redirige al login de Meta.
3. Meta redirige a `/api/auth/callback/meta` con un `code`. El servidor:
   - lo cambia por un token de usuario (corto → largo, ~60 días),
   - lista todas las Pages que administras (`/me/accounts`),
   - para cada Page, busca su Instagram Business vinculado,
   - cifra todo (AES-256-GCM) y lo guarda temporalmente en `oauth_sessions`.
4. Te manda a `/settings/accounts/select`, donde eliges qué Pages
   pertenecen a ese negocio.
5. Al confirmar, cada Page (y su Instagram, si tiene) se guarda como una fila
   en `accounts`, con el token ya cifrado. `oauth_sessions` se borra (uso único).

Puedes repetir el flujo por cada negocio/Page que quieras conectar.

## 3. Sync de métricas (Fase 2)

`POST /api/sync?account_id=<uuid>&scope=all|stories` sincroniza **una cuenta
por llamada** — así cada invocación cabe cómoda en el timeout de 10s de
Vercel Hobby sin importar cuántas cuentas tengas. `GET /api/sync/accounts`
lista las cuentas activas para que el caller sepa a quién llamar. Ambos
requieren `Authorization: Bearer $SYNC_CRON_SECRET`.

- `scope=all` (default): posts/reels + audiencia.
- `scope=stories`: solo historias activas — pensado para un cron más
  frecuente, porque expiran a las 24h.

### GitHub Action (scheduler externo)

Vercel Hobby limita el cron nativo a 1x/día, así que `.github/workflows/sync.yml`
ya está armado para correr desde GitHub Actions: sync completo cada 4h +
sync de historias cada hora. Para activarlo:

1. En el repo de GitHub → Settings → Secrets and variables → Actions, agrega:
   - `APP_URL` → tu dominio de Vercel (ej. `https://social-pulse.vercel.app`)
   - `SYNC_CRON_SECRET` → el mismo valor que pusiste en Vercel
2. Push del repo a GitHub — el workflow ya queda programado.
3. Puedes probarlo manualmente desde la pestaña Actions → "sync-metrics" → "Run workflow".

## 4. Dashboard (Fase 3)

- **Resumen** (`/`): seguidores totales, contenido publicado, engagement
  promedio, crecimiento de seguidores y comparativa de engagement por red —
  con filtros por negocio y por red.
- **Contenido** (`/content`): galería de posts/reels/historias con
  miniatura, tipo y fecha.
- **Detalle** (`/content/[id]`): métricas actuales + evolución en el tiempo
  (un punto por snapshot de `/api/sync`) + métricas específicas del tipo
  (ej. taps_forward/exits en historias).

Todo esto queda vacío hasta que corra el primer sync — los estados vacíos
te lo indican explícitamente en vez de mostrar ceros engañosos.

## 5. Recomendaciones (Fase 4)

En `/recommendations`, elige un negocio y presiona "Generar recomendaciones".
El botón:

1. Calcula (en TypeScript, sobre los datos ya sincronizados) el mejor
   horario de publicación por día/hora y compara engagement entre
   posts/reels/historias — se guardan como `recommendations` (`kind`
   `best_time` / `top_format`).
2. Si `ANTHROPIC_API_KEY` está configurada, le pasa tus posts históricos
   con mejor desempeño a Claude (`lib/anthropic/client.ts`) y le pide 5
   ideas de contenido nuevas, guardadas como `kind=content_idea`.

Sin contenido sincronizado con métricas, no hay suficiente data para
calcular nada — el mensaje vacío te lo recuerda.

## 6. WhatsApp (Fase 5)

Bandeja en `/whatsapp` para leer y responder mensajes de WhatsApp Cloud
API a mano — **sin auto-respuesta** en esta fase.

**Costo**: recibir mensajes y responder dentro de la ventana de servicio
de 24h (desde el último mensaje que te escribió el contacto) es gratis e
ilimitado. Solo cuestan las plantillas de marketing/proactivas, que acá
no se usan — este flujo es 100% gratis.

### Setup en Meta

1. En tu App de Meta for Developers, agregá el producto **WhatsApp**.
2. En **API Setup** conseguís `WHATSAPP_PHONE_NUMBER_ID` y podés probar
   con el número de prueba que da Meta (o agregar tu número de negocio
   verificado más adelante).
3. **WhatsApp Business Account ID** (`WHATSAPP_BUSINESS_ACCOUNT_ID`) está
   en la misma pantalla.
4. Generá un **token permanente**: Meta Business Suite → System Users →
   creá un System User → asignale el permiso `whatsapp_business_messaging`
   sobre tu WhatsApp Business Account → generá el token desde ahí (el
   token temporal de la consola de desarrollo expira en 24h, no sirve
   para producción).
5. Configurá el **Webhook** (WhatsApp → Configuration):
   - Callback URL: `<NEXT_PUBLIC_APP_URL>/api/webhooks/whatsapp`
   - Verify token: cualquier string que elijas — ponelo también en
     `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
   - Suscribite al campo `messages`.
6. Completá las 4 variables en `.env.local` (y en Vercel para producción).

### Límites de esta fase

- Los estados de WhatsApp (historias) no se publican por API.
- Difusión masiva o mensajes fuera de la ventana de 24h requieren
  plantillas pre-aprobadas, que son de pago — queda fuera de alcance a
  propósito.
- Sin auto-respuesta: cada mensaje se responde a mano desde `/whatsapp`.

## 7. Publicar a varias redes + carrusel (Fase 6)

Desde `/calendar`, el botón **"Publicar a varias redes"** adjunta un
video (o varias imágenes para carrusel) y un texto una sola vez, y los
publica a **todas las cuentas que marques** (tus Instagram, Facebook y
TikTok conectados), cada una de forma independiente:

- Se crea una fila de `content_calendar` por cuenta destino, todas
  agrupadas por `post_group_id`. Si una red falla, las demás no se ven
  afectadas — el panel muestra el estado de cada una por separado.
- Cada fila se publica con el mismo `startPublish`/`pollPublishStatus`
  de siempre (una cuenta por invocación, sigue cabiendo en el timeout de
  Vercel Hobby), disparadas todas en paralelo desde el navegador.
- **Carrusel** (2+ imágenes, máx. 10): Instagram arma un container
  `CAROUSEL` con un child container por imagen; Facebook sube cada foto
  sin publicar (`published=false`) y las adjunta a un post con
  `attached_media`; TikTok usa el modo foto de la Content Posting API
  (mismo flujo de borrador/inbox que el video). Un carrusel es siempre
  de imágenes — no se puede mezclar con video.
- El panel de edición de una sola pieza (click en "Publicar" sobre una
  pieza del calendario) sigue funcionando igual que antes para publicar
  a **una** cuenta con **un** archivo — el fan-out es un flujo aparte,
  no un reemplazo.

⚠️ El modo foto de TikTok (`media_type: "PHOTO"` en la Content Posting
API) está implementado según la documentación pública, pero **no se probó
contra una cuenta real** — mismo caveat que el resto de la integración de
TikTok en este proyecto. Verificalo contra la documentación viva antes de
depender de él en producción.

## 8. Motor Composio (rediseño en curso)

⚠️ Numeración aparte a propósito: las "Fases" de las secciones 1-6 de
arriba son las del build original de este proyecto. Esta sección es de
un rediseño posterior (rama `feature/composio-v2`) que reemplaza el
sistema de diseño y migra la integración de IG/FB/TikTok a
[Composio](https://composio.dev) — su propio plan de fases (Fase 0 =
diseño, Fase 1 = esto) es independiente del de arriba.

**Qué es esto y qué no es todavía**: `src/lib/social/*` es un motor de
integración nuevo que corre **en paralelo** a la integración directa
actual (`src/lib/meta/*`, `src/lib/tiktok/*`, `src/lib/platforms/*`) —
no la reemplaza ni la toca. Se retira código directo solo cuando su
equivalente en Composio queda verificado, cuenta por cuenta, no de una.

### Setup

1. Conseguí tu API key en [app.composio.dev](https://app.composio.dev) →
   Settings → API Keys.
2. Agregá `COMPOSIO_API_KEY` a `.env.local` (y a Vercel para producción)
   — server-side únicamente, nunca se expone al cliente.
3. Andá a `/settings/composio`, elegí un negocio y conectá Instagram/
   Facebook con el botón — Composio maneja el OAuth con su propia auth
   administrada, no hace falta credenciales propias de Meta para esto.
4. **TikTok es distinto**: no acepta la auth administrada de Composio,
   necesita tu propia app (`TIKTOK_CLIENT_KEY`/`TIKTOK_CLIENT_SECRET`,
   las mismas que ya usa la integración directa). El código para crear
   ese auth config por API existe (`getOrCreateTikTokAuthConfig` en
   `lib/social/connections.ts`) pero **el nombre exacto de los campos de
   credenciales no está verificado contra la API real de Composio
   todavía** — antes de confiar en él, probalo con tu API key real o
   armá el auth config una vez a mano en el dashboard de Composio
   (Toolkits → TikTok → Configure) e inspeccioná el payload que arma esa
   UI para confirmar los nombres de campo.

### Qué ya funciona de punta a punta

`/settings/composio` trae analíticas de Instagram **en vivo** vía
Composio (perfil, alcance/interacciones de los últimos 7 días, últimas
publicaciones) — el proof of concept de la Fase 1. Reutiliza
`ProviderContentItem` (`lib/platforms/types.ts`) como shape de salida,
así que cuando esto reemplace al sync directo (Fase 3 del plan de
Composio) el resto de la app no debería tener que cambiar.

### Cómo se modela

`composio_connections` (migración `0015`) mapea cada cuenta conectada
por Composio a un negocio — tabla nueva, separada de `accounts` (la de
la integración directa) a propósito: así ninguna migra hasta que se
decida moverla, y nada de lo existente (sync, calendario, comentarios)
se ve afectado mientras tanto.

### Verificado contra el SDK real, no inventado

El shape exacto de `@composio/core` (`composio.tools.execute(slug,
{userId, connectedAccountId, arguments})`, `composio.connectedAccounts.
link(...)`, `composio.authConfigs.create(...)`) se confirmó leyendo el
código fuente TypeScript que se instala con el paquete
(`node_modules/@composio/core/src/`), no adivinado ni copiado de docs
scrapeadas — la documentación pública no fue 100% consistente entre sí
en algunos puntos durante la investigación. Los slugs de tools
(`INSTAGRAM_GET_USER_INFO`, `INSTAGRAM_POST_IG_USER_MEDIA`,
`FACEBOOK_CREATE_MULTI_PHOTO_POST`, etc.) se verificaron contra el
catálogo real de Composio, no contra la lista original del brief (que
tenía al menos un slug con nombre incorrecto —
`INSTAGRAM_CREATE_MEDIA_CONTAINER` no existe, es
`INSTAGRAM_POST_IG_USER_MEDIA`).

⚠️ **`composio.connectedAccounts.initiate()` está deprecado** — devuelve
400 en el backend real ("no longer supported... Use POST
/api/v3/connected_accounts/link instead") pese a que el propio código
fuente del SDK todavía lo expone y documenta como si fuera el método
vigente. Se descubrió probando en vivo contra una API key real, no leyendo
el código — usá `composio.connectedAccounts.link()` (mismo shape de
retorno, mismo `allowMultiple`), que es lo que usa
`initiateComposioConnection` en `settings/composio/actions.ts`. Ojo si en
el futuro se lee la SDK de nuevo: el código fuente por sí solo no alcanza
para saber qué endpoints retiró el backend.

Otra cosa importante que costó encontrar: Composio tiene **productos
separados bajo el mismo login** — "Connect" (`dashboard.composio.dev`,
para conectar tus propias apps de IA a un MCP, con su propio tipo de
key) y "Platform" (`Build agents with the Composio SDK`, con API keys de
*proyecto*, no de *organización* — la página de tokens de organización
literalmente dice "if you are looking for API keys go to project
settings"). `@composio/core` necesita la de Platform → Project → API
Keys específicamente. Si conectaste cuentas antes vía "Connect" (o vía
un MCP de Composio ya autenticado en otra herramienta), esas conexiones
NO aparecen bajo el proyecto de Platform — son namespaces distintos.

## Limitaciones conocidas de TikTok

Dos cosas que **no son bugs de este código**, sino límites reales del
acceso actual a la API de TikTok (Login Kit + Content Posting API, scopes
`user.info.profile`, `user.info.stats`, `video.list`):

- **Sin comentarios de terceros**: no existe ningún scope en el listado
  oficial de OAuth scopes de TikTok for Developers para leer comentarios
  de un video (verificado contra la documentación viva al momento de este
  fix). Lo más cercano es la Research API (`research.data.*`), que es un
  programa aparte con aprobación separada para investigadores, no algo
  que se habilite en un Login Kit normal. `tiktokProvider.fetchComments`
  queda sin implementar a propósito — la UI (`/comments` con filtro
  TikTok, y el detalle de contenido de una pieza de TikTok) avisa esto en
  vez de mostrar una bandeja vacía sin explicación.
- **Sin video reproducible**: `video.list` (Display API) solo devuelve
  `cover_image_url` (portada) y `share_url` (permalink a la app de
  TikTok) — no hay una URL de archivo de video descargable/embebible con
  estos scopes. El dashboard en general tampoco reproduce video de
  ninguna red (solo miniatura + link "Ver original"), así que esto es
  consistente con Instagram/Facebook, pero en TikTok es más notorio
  porque no hay alternativa de reproducir inline en absoluto.
  - Además, `cover_image_url` es una URL firmada por TikTok que **expira
    a los pocos días** — por eso el sync ahora la descarga y la sube a
    Supabase Storage al momento de sincronizar (ver
    `cacheRemoteThumbnail` en `src/lib/supabase/storage.ts`, llamado desde
    `src/app/api/sync/route.ts`), guardando
    esa copia estable en `thumbnail_url` en vez de la URL firmada. Si el
    caching falla (por la razón que sea), cae de vuelta a la URL de
    TikTok tal cual — mejor una miniatura que puede expirar más adelante
    que ninguna.

Si en el futuro TikTok aprueba un producto/scope con acceso a comentarios
o a un archivo de video real, `fetchComments`/`mediaUrl` en
`src/lib/platforms/tiktok.ts` son los puntos de extensión — seguí el
mismo contrato (`ProviderComment[]`, `ProviderContentItem.mediaUrl`) que
usan Instagram y Facebook.

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/login/            # login del dueño
│   ├── (dashboard)/             # shell con sidebar + rutas del dashboard
│   │   ├── settings/accounts/   # gestión de negocios y cuentas conectadas (integración directa)
│   │   ├── settings/composio/   # conexiones + proof of concept del motor Composio (en paralelo)
│   │   ├── content/             # galería + detalle de contenido
│   │   ├── analytics/           # heatmap de horario, formato, comparador de cuentas
│   │   ├── comments/            # bandeja centralizada de comentarios
│   │   ├── calendar/            # calendario, publicación y fan-out multi-red
│   │   ├── recommendations/     # motor de recomendaciones
│   │   ├── reports/             # reportes semanales por plantilla
│   │   └── whatsapp/            # bandeja de WhatsApp Cloud API
│   └── api/
│       ├── auth/{meta,tiktok}/start/      # inicia OAuth
│       ├── auth/callback/{meta,tiktok}/   # recibe el callback
│       ├── sync/                # sync de métricas (+ /accounts para listar)
│       ├── reports/weekly/      # genera los reportes semanales (cron)
│       ├── webhooks/whatsapp/   # webhook de WhatsApp Cloud API
│       └── media/[...path]/     # proxy de dominio verificado para TikTok
├── components/
│   ├── ui/                      # primitivos de UI
│   ├── charts/                  # wrappers de Recharts con el theme del proyecto
│   └── dashboard/                # componentes del dashboard
├── lib/
│   ├── supabase/                # clientes server/browser/admin + storage
│   ├── meta/                    # llamadas crudas a la Graph API (oauth, IG, FB)
│   ├── tiktok/                  # llamadas crudas a la API de TikTok
│   ├── whatsapp/                # WhatsApp Cloud API (envío, ventana de 24h, queries)
│   ├── platforms/                # interfaz PlatformProvider (instagram/facebook/tiktok)
│   ├── social/                   # motor Composio (client, instagram, connections) — en paralelo
│   ├── analytics/                # agregaciones (engagement, queries, recomendaciones,
│   │                             # clasificación de comentarios, alertas, reporte semanal)
│   ├── anthropic/                # integración con la API de Claude (opcional)
│   └── crypto.ts                # cifrado AES-256-GCM de tokens
└── types/db.ts                  # tipos de la base de datos
supabase/migrations/               # 0001 a 0013, numeradas y secuenciales
.github/workflows/
├── sync.yml                     # sync de métricas/historias/comentarios
└── weekly-report.yml            # reportes semanales (lunes)
```

## Notas de diseño

- **Multi-negocio**: `brands` agrupa cuentas; cada `account` pertenece a un
  negocio y a una red (`platform`). Filtrar "por negocio" = filtrar por
  `brand_id`; filtrar "por red" = filtrar por `platform`.
- **Extensible por red**: agregar una red nueva no toca el esquema — solo
  se conectan cuentas con el `platform` correspondiente y se implementa
  `PlatformProvider` (ver `src/lib/platforms/{instagram,facebook,tiktok}.ts`
  como ejemplo), registrándolo en `src/lib/platforms/index.ts`. Las 3 redes
  actuales ya siguen este patrón.
- **Contenido con historial**: cada pieza (`content`) tiene snapshots de
  métricas con fecha (`content_metrics`), nunca se sobreescriben — así se
  puede graficar la evolución en el tiempo de cualquier post/reel/historia.
- **Tokens**: se cifran con AES-256-GCM antes de tocar la BD
  (`src/lib/crypto.ts`). La clave vive solo en variables de entorno.
- **Todas las páginas del dashboard son `force-dynamic`**: leen datos por
  sesión/usuario, así que nunca se sirven cacheadas entre distintos
  visitantes ni se congelan en el snapshot del build.
# dashboard-redes
