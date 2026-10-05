-- Dorado · featured product sorting · 2026-10-05
alter table public.productos
  add column if not exists destacado boolean not null default false;

comment on column public.productos.destacado is
'Marca manual de producto destacado para el ordenamiento de la tienda pública.';
