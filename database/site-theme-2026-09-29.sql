-- Dorado Artículos de Pesca — tema público configurable · 2026-09-29
create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  default_theme text not null default 'default' check (default_theme in ('default','light','dark')),
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, default_theme)
values (1, 'default')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

revoke all on table public.site_settings from public;
grant select on table public.site_settings to anon, authenticated;
grant update on table public.site_settings to authenticated;
grant all on table public.site_settings to service_role;

drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings"
  on public.site_settings
  for select
  to anon, authenticated
  using (id = 1);

drop policy if exists "Admins can update site settings" on public.site_settings;
create policy "Admins can update site settings"
  on public.site_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
