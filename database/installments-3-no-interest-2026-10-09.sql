-- Cuotas sin interés por producto · DORADO 2026-10-09.
-- Migración segura: todos los productos actuales permanecen desactivados.
alter table public.productos
  add column if not exists cuotas_sin_interes_3 boolean not null default false;
comment on column public.productos.cuotas_sin_interes_3 is
  'Producto autorizado para ofrecer hasta 3 cuotas sin interés. Solo aplica cuando todos los productos del pedido participan de la promoción.';
-- Auditar el plan realmente elegido al crear el pedido.
alter table public.pedidos
  add column if not exists cuotas_elegidas smallint not null default 1
    check (cuotas_elegidas between 1 and 24);
-- Un checkout normal conserva los planes existentes; el límite de 3 solo aplica a promociones.
do $
begin
  if exists (select 1 from pg_constraint where conname = 'pedidos_cuotas_elegidas_check'
    and conrelid = 'public.pedidos'::regclass) then
    alter table public.pedidos drop constraint pedidos_cuotas_elegidas_check;
  end if;
  alter table public.pedidos add constraint pedidos_cuotas_elegidas_check
    check (cuotas_elegidas between 1 and 24);
end $;