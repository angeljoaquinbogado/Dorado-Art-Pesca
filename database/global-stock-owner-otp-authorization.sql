-- DORADO → Global Stock: segundo factor por email y grant de un solo uso.
-- Aplicado en Supabase el 2026-10-01.

create table if not exists public.global_stock_authorization_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  salt text not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 20),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.global_stock_authorization_challenges enable row level security;

create index if not exists global_stock_auth_challenges_owner_idx
  on public.global_stock_authorization_challenges (owner_user_id, created_at desc);

create index if not exists global_stock_auth_challenges_expiry_idx
  on public.global_stock_authorization_challenges (expires_at);

create table if not exists public.global_stock_authorization_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  grant_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.global_stock_authorization_grants enable row level security;

create index if not exists global_stock_auth_grants_owner_idx
  on public.global_stock_authorization_grants (owner_user_id, created_at desc);

create index if not exists global_stock_auth_grants_expiry_idx
  on public.global_stock_authorization_grants (expires_at);
