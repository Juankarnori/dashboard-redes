-- TikTok: el access token expira a las 24h (a diferencia del Page token
-- de larga duración de Meta) y hay que refrescarlo activamente con un
-- refresh_token — que además rota en cada uso (ver lib/tiktok/oauth.ts:
-- cada refresh devuelve un refresh_token nuevo, el anterior queda
-- inválido, así que hay que persistir el par completo cada vez).
-- Las cuentas de Meta no lo necesitan y quedan con refresh_token null.
alter table accounts
  add column refresh_token text; -- CIFRADO en la app (ver lib/crypto.ts), igual que access_token
