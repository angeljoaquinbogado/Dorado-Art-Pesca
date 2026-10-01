-- Global Stock secure integration
-- Applied to production Supabase on 2026-10-01.
-- Idempotent source-of-truth migration kept in the repository.

alter table public.productos
  add column if not exists costo numeric(12,2),
  add column if not exists proveedor text,
  add column if not exists codigo_barras text,
  add column if not exists stock_minimo integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_costo_no_negativo'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_costo_no_negativo
      check (costo is null or costo >= 0) not valid;

    alter table public.productos
      validate constraint productos_costo_no_negativo;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'productos_stock_minimo_no_negativo'
      and conrelid = 'public.productos'::regclass
  ) then
    alter table public.productos
      add constraint productos_stock_minimo_no_negativo
      check (stock_minimo >= 0) not valid;

    alter table public.productos
      validate constraint productos_stock_minimo_no_negativo;
  end if;
end $$;

create index if not exists productos_codigo_barras_idx
on public.productos (codigo_barras)
where codigo_barras is not null and btrim(codigo_barras) <> '';

create table if not exists public.global_stock_integrations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Global Stock',
  token_hash text not null unique,
  token_prefix text not null,
  scopes text[] not null default array[
    'catalog:read',
    'inventory:read',
    'inventory:write',
    'orders:read'
  ]::text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists global_stock_integrations_owner_idx
on public.global_stock_integrations (owner_user_id, created_at desc);

create index if not exists global_stock_integrations_active_hash_idx
on public.global_stock_integrations (token_hash)
where revoked_at is null;

alter table public.global_stock_integrations enable row level security;

revoke all on table public.global_stock_integrations
from public, anon, authenticated;

grant select, insert, update, delete
on table public.global_stock_integrations
to service_role;

comment on table public.global_stock_integrations is
'Scoped, hashed integration tokens issued only by an authenticated Dorado admin for Global Stock.';

comment on column public.productos.costo is
'Purchase/unit cost. Nullable until the business records a real cost; never inferred from sale price.';

comment on column public.productos.proveedor is
'Real supplier/vendor name for stock operations.';

comment on column public.productos.codigo_barras is
'Business barcode/SKU used by Global Stock scanner and printed labels.';

comment on column public.productos.stock_minimo is
'Minimum desired on-hand units for replenishment planning.';
