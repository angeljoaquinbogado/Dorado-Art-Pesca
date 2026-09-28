-- Dorado Artículos de Pesca
-- Organización del catálogo por marca.
-- Aplicado en producción el 2026-09-28.

alter table public.productos
    add column if not exists marca text;

create index if not exists productos_marca_lower_idx
    on public.productos ((lower(btrim(marca))))
    where nullif(btrim(marca), '') is not null;

comment on column public.productos.marca is
    'Marca comercial del producto. Se usa para navegación pública y filtros del panel admin.';
