-- Fase 6: "adjunto una vez, publico a varias redes" (fan-out) + carrusel.
--
-- Fan-out: al enviar el formulario multi-destino se crea una fila de
-- content_calendar POR CUENTA destino, todas con el mismo post_group_id —
-- así cada una se publica independiente (startPublish sigue siendo "una
-- cuenta por invocación") y si una red falla las demás no se tocan.
--
-- Carrusel: media_paths guarda el arreglo ordenado de imágenes cuando son
-- varias. media_path/media_type NO se tocan — siguen siendo la ruta feliz
-- para el caso de un solo archivo (imagen o video), sin romper nada de lo
-- que ya existe.
alter table content_calendar
  add column post_group_id uuid,
  add column media_paths   text[];

create index content_calendar_post_group_idx on content_calendar (post_group_id) where post_group_id is not null;
