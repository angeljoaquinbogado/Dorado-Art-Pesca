-- Cuotas sin interés por producto · DORADO 2026-10-09.
-- Migración segura: todos los productos actuales permanecen desactivados.
alter table public.productos
  add column if not exists cuotas_sin_interes_3 boolean not null default false;
comment on column public.productos.cuotas_sin_interes_3 is
  'Producto autorizado para ofrecer hasta 3 cuotas sin interés. Solo aplica cuando todos los productos del pedido participan de la promoción.';
-- Auditar el plan realmente elegido al crear el pedido.
alter table public.pedidos
  add column if not exists cuotas_elegidas smallint not null default 1
    check (cuotas_elegidas in (1, 3));