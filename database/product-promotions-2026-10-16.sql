-- Promoción voluntaria independiente de los descuentos y las cuotas.
alter table public.productos add column if not exists en_promocion boolean not null default false;
create index if not exists productos_promociones_activos_idx on public.productos(id) where activo=true and en_promocion=true;
