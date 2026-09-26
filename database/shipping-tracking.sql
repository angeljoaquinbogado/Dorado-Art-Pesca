-- DORADO ARTÍCULOS DE PESCA
-- Seguimiento de envíos semiautomático. Migración idempotente.

alter table public.pedidos
  add column if not exists envio_transportista text,
  add column if not exists envio_tracking_codigo text,
  add column if not exists envio_tracking_url text,
  add column if not exists envio_estado text not null default 'pendiente',
  add column if not exists envio_despachado_at timestamptz,
  add column if not exists envio_actualizado_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pedidos_envio_estado_check'
      and conrelid = 'public.pedidos'::regclass
  ) then
    alter table public.pedidos add constraint pedidos_envio_estado_check
      check (envio_estado in ('pendiente','despachado','en_transito','en_distribucion','entregado','incidencia'));
  end if;
end
$$;

create index if not exists pedidos_envio_estado_idx on public.pedidos(envio_estado);
grant select, insert, update on table public.pedidos to service_role;
grant select, update on table public.pedidos to authenticated;
