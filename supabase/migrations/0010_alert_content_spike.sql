-- Fase 3: alertas de "contenido que despega" (content_spike) referencian
-- una pieza puntual, no solo la cuenta — a diferencia de engagement_drop /
-- no_posts_streak / reach_drop, que son a nivel cuenta. content_id queda
-- nullable para no romper esos otros tipos.
alter table alerts
  add column content_id uuid references content(id) on delete cascade;

create index alerts_content_idx on alerts (content_id) where content_id is not null;
