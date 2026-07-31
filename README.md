# Social Pulse

Dashboard de métricas y recomendaciones de contenido para Instagram y
Facebook (arquitectura lista para agregar TikTok más adelante).

Stack: Next.js 16 (App Router) + TypeScript + Supabase (Postgres/Auth) +
Tailwind CSS v4 + Recharts. Desplegado en Vercel (plan Hobby).

## Estado del proyecto

Las 4 fases están implementadas en código. Lo que **no** está hecho todavía
es probarlas contra una cuenta de Meta y un proyecto de Supabase reales —
eso requiere que completes el setup de la sección 1.

- **Fase 1 — Setup y autenticación** ✅
  - Esquema de BD (`supabase/migrations/0001_init.sql`)
  - Login del dueño (Supabase Auth)
  - OAuth de Meta: conectar Pages de Facebook + su Instagram Business vinculado,
    agrupadas por "negocio" (`brands`)
- **Fase 2 — Sync de métricas** ✅ (`/api/sync`, un provider por red, GitHub Action)
- **Fase 3 — Dashboard** ✅ (resumen, galería de contenido, detalle con evolución)
- **Fase 4 — Recomendaciones** ✅ (mejor horario/formato en TS + ideas con Claude)

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

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/login/            # login del dueño
│   ├── (dashboard)/             # shell con sidebar + rutas del dashboard
│   │   ├── settings/accounts/   # gestión de negocios y cuentas conectadas
│   │   ├── content/             # galería + detalle de contenido
│   │   └── recommendations/     # motor de recomendaciones
│   └── api/
│       ├── auth/meta/start/     # inicia OAuth de Meta
│       ├── auth/callback/meta/  # recibe el callback de Meta
│       └── sync/                # sync de métricas (+ /accounts para listar)
├── components/
│   ├── ui/                      # primitivos de UI
│   ├── charts/                  # wrappers de Recharts con el theme del proyecto
│   └── dashboard/                # componentes del dashboard
├── lib/
│   ├── supabase/                # clientes server/browser/admin
│   ├── meta/                    # llamadas crudas a la Graph API (oauth, IG, FB)
│   ├── platforms/                # interfaz PlatformProvider (instagram/facebook, extensible a TikTok)
│   ├── analytics/                # agregaciones (engagement, overview, recomendaciones)
│   ├── anthropic/                # integración con la API de Claude
│   └── crypto.ts                # cifrado AES-256-GCM de tokens
└── types/db.ts                  # tipos de la base de datos
supabase/migrations/0001_init.sql
.github/workflows/sync.yml
```

## Notas de diseño

- **Multi-negocio**: `brands` agrupa cuentas; cada `account` pertenece a un
  negocio y a una red (`platform`). Filtrar "por negocio" = filtrar por
  `brand_id`; filtrar "por red" = filtrar por `platform`.
- **Extensible a TikTok**: agregar una red nueva no toca el esquema — solo
  se conectan cuentas con `platform='tiktok'` y se implementa
  `PlatformProvider` en `src/lib/platforms/tiktok.ts`, registrándolo en
  `src/lib/platforms/index.ts`.
- **Contenido con historial**: cada pieza (`content`) tiene snapshots de
  métricas con fecha (`content_metrics`), nunca se sobreescriben — así se
  puede graficar la evolución en el tiempo de cualquier post/reel/historia.
- **Tokens**: se cifran con AES-256-GCM antes de tocar la BD
  (`src/lib/crypto.ts`). La clave vive solo en variables de entorno.
- **Todas las páginas del dashboard son `force-dynamic`**: leen datos por
  sesión/usuario, así que nunca se sirven cacheadas entre distintos
  visitantes ni se congelan en el snapshot del build.
# dashboard-redes
