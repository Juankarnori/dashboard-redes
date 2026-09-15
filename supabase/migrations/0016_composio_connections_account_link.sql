-- Backfill de composio_connections.account_id — hasta ahora quedaba en
-- null siempre (confirmComposioConnection nunca lo resolvía). Las
-- tablas que ya alimentan Resumen/Analíticas (content, content_metrics,
-- audience_snapshot) cuelgan de accounts.id, no de composio_connections
-- — sin este link, el sync no tiene dónde escribir cuando lee por
-- Composio (ver Fase 2).
--
-- Asume 1 cuenta activa por negocio+red (cierto hoy: la integración
-- directa y Composio apuntan a la misma cuenta real de cada negocio).
-- Si en el futuro un negocio conecta 2 cuentas de la misma red por
-- Composio (allowMultiple:true lo permite), este backfill deja de
-- alcanzar y hay que matchear por external_id real, no por brand+platform.
update composio_connections cc
set account_id = a.id
from accounts a
where a.brand_id = cc.brand_id
  and a.platform = cc.platform
  and a.status = 'active'
  and cc.account_id is null;
