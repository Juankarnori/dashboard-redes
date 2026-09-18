# Prompt para Claude Code — dashboard-redes: WhatsApp (donde se cierran las ventas)

> Contexto: la app (`Juankarnori/dashboard-redes`, Next.js + Supabase + Vercel, motor Composio) ya tiene bandeja de comentarios de IG/FB con **detector de leads** (🔥) funcionando. **Todos los CTAs del negocio cierran por WhatsApp** (número **0984613243**), así que WhatsApp es donde de verdad se convierte en venta. Objetivo de esta tanda: que un lead detectado en redes termine en una conversación de WhatsApp bien atendida, con el menor trabajo manual posible.
>
> ⚠️ **Dato clave:** WhatsApp **ya estuvo construido y se dio de baja en agosto 2026** — el código sigue en el repo: `lib/whatsapp/{client,queries,actions,service-window}.ts`, `app/(dashboard)/whatsapp/*` y `app/api/webhooks/whatsapp/route.ts` (integración con la WhatsApp Business **Cloud API** de Meta, con manejo de la ventana de 24h). No empieces de cero: **primero revisá ese código, entendé por qué se pausó y qué le falta**, y proponé el plan. Esperá mi OK antes de programar.

---

## Antes de decidir el camino — dos opciones, quiero tu recomendación

**Camino A — Revivir el inbox de WhatsApp (Cloud API de Meta).** Recibir mensajes entrantes por el webhook, mostrarlos en una bandeja dentro de la app, responder con plantillas + borrador de IA en la voz de marca, respetando la ventana de 24h. Es el "de verdad automatizar WhatsApp" porque gestiona el lugar donde se cierra la venta. Costo: setup de Meta (número registrado en WhatsApp Business Cloud API, y plantillas aprobadas por Meta para escribir fuera de la ventana de 24h). Ventaja: **el esqueleto ya existe**, revivir es menos trabajo que rehacer.

**Camino B — Ligero, sin API (cero setup, cero costo).** La app no toca los chats de WhatsApp; solo (1) genera links `wa.me/593984613243?text=...` con mensaje pre-cargado por producto para bio y respuestas, y (2) una biblioteca de **respuestas rápidas / precios** con generación por IA que Juan copia y pega en WhatsApp del celular. Inmediato, pero sin bandeja ni automatización real de los chats.

**Revisá el código pausado y decime cuál conviene** (y por qué se pausó: si fue por la fricción/costo del Cloud API, eso pesa en la decisión). Mi inclinación: **A como meta**, porque es donde está el valor real y el código ya existe; **B como puente inmediato** si el setup de Meta te va a demorar. Podés entregar B primero y A después. Confirmámelo en el plan.

---

## Alcance (asumiendo Camino A, o A sobre B)

### 1. Revivir y terminar el inbox de WhatsApp
- Reactivar `lib/whatsapp/*` + `app/(dashboard)/whatsapp/*` + el webhook. Reponer el link en el sidebar (se había quitado).
- **Composio primero:** verificá si Composio tiene un toolkit de WhatsApp (Business); si existe y cubre lo necesario, routeá por ahí para ser consistente con el resto del motor (mismo patrón `resolveProviderForAccount` / providers `*-composio.ts`). Si no, usá/terminá la integración directa Cloud API que ya está.
- Bandeja de conversaciones: lista de chats, mensajes, estado de la **ventana de 24h** (ya hay `service-window.ts`) — fuera de la ventana, solo se puede escribir con plantilla aprobada; adentro, texto libre.

### 2. Respuestas con IA + plantillas (la parte que ahorra tiempo)
- **Borrador de IA** de la respuesta a cada mensaje entrante, en la **voz de marca** (cercana, local, con precios cuando corresponda) — reutilizá el cliente de Anthropic que ya existe (`lib/anthropic/client.ts`). **Siempre borrador editable, nunca auto-envío** (mismo criterio que el inbox de comentarios).
- **Biblioteca de respuestas rápidas / precios**: las FAQs reales del negocio (carátulas A5 $1,50 / 5 por $6,50, A4 $2,00; membretes/kits desde $5; esferos 1 $3 / 3 $8 / 6 $15; impresión 3D; etc.), gestionables en la app, insertables con un clic. Que la IA pueda generar una respuesta nueva a partir de estas.

### 3. Handoff desde el inbox de leads (el puente redes → WhatsApp)
- En la bandeja de comentarios, para un comentario marcado 🔥 Lead: un botón que (a) publica la respuesta pública invitando a escribir al WhatsApp (con el `wa.me`), y (b) registra el lead como "esperando WhatsApp" para no perderle el rastro.
- Nota real: desde un comentario **no tenés el número del cliente**, así que el handoff es empujarlo a WhatsApp con contexto, no escribirle vos. Cuando el cliente escribe, entra al inbox del punto 1.

### 4. (Camino B, si se hace como puente) 
- Generador de links `wa.me` con texto pre-cargado por producto (para bio/respuestas) + la biblioteca de respuestas rápidas del punto 2, sin depender del Cloud API. Esto se puede entregar aunque el Cloud API no esté listo.

---

## Setup de Meta que voy a necesitar (documentámelo, no lo adivines)
Si vamos por el Cloud API, listame exactamente qué tengo que hacer del lado de Meta (número en WhatsApp Business Cloud API, `WHATSAPP_TOKEN`/`PHONE_NUMBER_ID`/`WABA_ID`/`VERIFY_TOKEN` como env vars, verificación del webhook, y qué plantillas mandar a aprobar), en pasos claros — como hiciste con las migraciones de Supabase.

## Restricciones (iguales a las fases anteriores)
- No romper lo existente; rama nueva; un commit por sub-parte. TypeScript estricto. Secrets/tokens solo server-side. Cambios de BD → SQL listo para pegar, explicado. Diseño "Centro de Redes", claro/oscuro, responsive.
- **Aprobación del dueño antes de enviar cualquier mensaje.** Nada de auto-envío.
- Verificá en vivo lo que se pueda (webhook recibiendo, envío de un mensaje de prueba a tu propio número) antes de darlo por cerrado; Playwright para la UI nueva.

## Cómo empezar
1. Revisá el código de WhatsApp pausado y resumí qué hace, qué le falta y por qué se pausó.
2. Recomendame Camino A vs B (o A sobre B) con su razón, y si Composio tiene toolkit de WhatsApp.
3. Proponé el plan (archivos, BD, setup de Meta, orden) y esperá mi OK.
