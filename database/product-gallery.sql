-- Dorado Artículos de Pesca — galería de imágenes por producto
-- Ejecutar una sola vez en Supabase SQL Editor.

alter table public.productos
add column if not exists imagenes text[] not null default '{}'::text[];

update public.productos
set imagenes = array[imagen]
where coalesce(array_length(imagenes, 1), 0) = 0
  and nullif(trim(imagen), '') is not null;

-- Mantiene imagen como principal por compatibilidad con carrito,
-- checkout y cualquier código anterior.
update public.productos
set imagen = imagenes[1]
where coalesce(array_length(imagenes, 1), 0) > 0
  and (
    nullif(trim(imagen), '') is null
    or imagen is distinct from imagenes[1]
  );
