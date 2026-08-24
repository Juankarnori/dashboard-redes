-- Bucket para cachear miniaturas cuyo origen expira (hoy: cover_image_url
-- de TikTok, una URL firmada que deja de servir a los pocos días — ver
-- cacheRemoteThumbnail en src/lib/supabase/storage.ts, llamado desde
-- src/app/api/sync/route.ts). Público de lectura,
-- igual que calendar-media; la escritura la hace siempre /api/sync con el
-- admin client (service role, bypasa RLS), así que no hace falta una
-- policy de insert/update para el flujo normal.
insert into storage.buckets (id, name, public)
values ('content-thumbnails', 'content-thumbnails', true)
on conflict (id) do nothing;
