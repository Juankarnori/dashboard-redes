-- Clasificación de comentarios por reglas (sentimiento + intención de
-- compra), calculada en TypeScript sin IA de pago — ver
-- src/lib/analytics/comment-classify.ts. Se corre al final del
-- scope=comments de /api/sync (comments-sync.ts).
alter table comments
  add column sentiment text check (
    sentiment in ('positive', 'negative', 'question', 'spam', 'lead', 'neutral')
  ),
  add column intent_score integer not null default 0,
  add column classified_at timestamptz;

-- Consulta que hace el hook de clasificación: "traeme lo que falta clasificar".
create index comments_unclassified_idx on comments (id) where classified_at is null;

-- Consulta que hace la bandeja: leads/negativos primero.
create index comments_sentiment_idx on comments (sentiment);
