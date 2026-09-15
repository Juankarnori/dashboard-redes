-- Fase 2: KPIs de "Alcance / vistas (7d)" e "Interacciones (7d)" en
-- Resumen, más el gráfico de tendencias diarias en Analíticas.
--
-- Tres columnas, no dos, a propósito — son conceptualmente distintas:
--   reach          -> alcance/vistas de ESE día únicamente. Alimenta el
--                     gráfico de tendencias. NUNCA sumar entre días para
--                     sacar un total de rango: una misma cuenta que
--                     vuelve varios días se contaría varias veces.
--   reach_7d       -> alcance único YA deduplicado de los últimos 7 días
--                     (metric_type=total_value en Instagram). Es lo que
--                     alimenta el KPI de Resumen — un valor propio, no
--                     una suma de `reach`.
--   interactions   -> interacciones/vistas de contenido de ESE día. A
--                     diferencia de reach, ESTO SÍ es aditivo entre días
--                     (son eventos, no cuentas únicas) — el KPI de 7d se
--                     puede calcular sumando 7 filas de `interactions`
--                     sin necesitar un total_value aparte.
--
-- Todas nullable: Facebook ya no tiene una métrica de reach a nivel de
-- Página (Meta la deprecó — el reemplazo más cercano es page_media_view,
-- que sí es aditivo y va en `interactions`, no en `reach`), y TikTok no
-- expone nada de esto a nivel de cuenta con los scopes actuales.
alter table audience_snapshot
  add column reach integer,
  add column reach_7d integer,
  add column interactions integer;

comment on column audience_snapshot.reach is 'Alcance/vistas de ese día únicamente — no acumulable entre días.';
comment on column audience_snapshot.reach_7d is 'Alcance único deduplicado de los últimos 7 días (total_value) — no es una suma de `reach`.';
comment on column audience_snapshot.interactions is 'Interacciones/vistas de contenido de ese día — aditivo entre días, a diferencia de `reach`.';
