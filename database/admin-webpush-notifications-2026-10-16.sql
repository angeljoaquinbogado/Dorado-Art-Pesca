-- DORADO Web Push: dispositivos autorizados y deduplicación de pagos.
create table if not exists public.admin_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_push_endpoint_https check (left(endpoint,8)='https://'),
  constraint admin_push_endpoint_length check (char_length(endpoint) between 20 and 2048)
);
create index if not exists admin_push_subscription_user_idx on public.admin_push_subscriptions(user_id);
alter table public.admin_push_subscriptions enable row level security;
revoke all on public.admin_push_subscriptions from anon, authenticated;
grant select,insert,update,delete on public.admin_push_subscriptions to service_role;
grant usage,select on sequence public.admin_push_subscriptions_id_seq to service_role;
create table if not exists public.admin_order_push_events (
  order_id uuid not null references public.pedidos(id) on delete cascade,
  event_type text not null check (event_type in ('paid','review')),
  created_at timestamptz not null default now(),
  primary key(order_id,event_type)
);
alter table public.admin_order_push_events enable row level security;
revoke all on public.admin_order_push_events from anon,authenticated;
grant select,insert,delete on public.admin_order_push_events to service_role;
