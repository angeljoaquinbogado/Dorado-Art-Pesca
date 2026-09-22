-- ============================================================
-- Dorado Artículos de Pesca - UPGRADE FINAL
-- Seguro para ejecutar sobre la base actual.
-- Incluye tracking, anti-spam, borrado admin y privilegios.
-- ============================================================

create extension if not exists pgcrypto;

alter table public.productos
    add column if not exists caracteristicas text;

alter table public.pedidos
    add column if not exists preparacion_estado text not null default 'nuevo',
    add column if not exists tracking_token uuid default gen_random_uuid();

update public.pedidos
set tracking_token = gen_random_uuid()
where tracking_token is null;

alter table public.pedidos
    alter column tracking_token set default gen_random_uuid(),
    alter column tracking_token set not null;

create unique index if not exists pedidos_tracking_token_uidx
on public.pedidos(tracking_token);

create or replace function public.admin_delete_orders(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_deleted integer := 0;
begin
    if auth.uid() is null
       or not exists (
           select 1 from public.admin_users where user_id = auth.uid()
       )
    then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    delete from public.pedidos
    where id = any(p_ids);

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

revoke all on function public.admin_delete_orders(uuid[]) from public;
revoke all on function public.admin_delete_orders(uuid[]) from anon;
grant execute on function public.admin_delete_orders(uuid[]) to authenticated;

create table if not exists public.checkout_rate_limits (
    key_hash text primary key,
    window_started_at timestamptz not null default now(),
    request_count integer not null default 0 check (request_count >= 0),
    updated_at timestamptz not null default now()
);

alter table public.checkout_rate_limits enable row level security;
revoke all on table public.checkout_rate_limits from anon;
revoke all on table public.checkout_rate_limits from authenticated;

create or replace function public.consume_checkout_rate_limit(
    p_key_hash text,
    p_limit integer default 10,
    p_window_seconds integer default 600
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_now timestamptz := now();
    v_started timestamptz;
    v_count integer;
    v_retry integer := 0;
begin
    if p_key_hash is null
       or length(p_key_hash) < 32
       or p_limit < 1
       or p_limit > 100
       or p_window_seconds < 60
       or p_window_seconds > 86400
    then
        raise exception 'invalid_rate_limit_input';
    end if;

    insert into public.checkout_rate_limits (
        key_hash, window_started_at, request_count, updated_at
    )
    values (p_key_hash, v_now, 1, v_now)
    on conflict (key_hash) do update
    set
        window_started_at = case
            when public.checkout_rate_limits.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            then v_now
            else public.checkout_rate_limits.window_started_at
        end,
        request_count = case
            when public.checkout_rate_limits.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            then 1
            else public.checkout_rate_limits.request_count + 1
        end,
        updated_at = v_now
    returning window_started_at, request_count
    into v_started, v_count;

    if v_count > p_limit then
        v_retry := greatest(
            1,
            ceil(extract(epoch from (
                v_started + make_interval(secs => p_window_seconds) - v_now
            )))::integer
        );

        return jsonb_build_object(
            'allowed', false,
            'retry_after', v_retry,
            'count', v_count
        );
    end if;

    delete from public.checkout_rate_limits
    where updated_at < v_now - interval '24 hours';

    return jsonb_build_object(
        'allowed', true,
        'retry_after', 0,
        'count', v_count
    );
end;
$$;

revoke all on function public.consume_checkout_rate_limit(text,integer,integer) from public;
revoke all on function public.consume_checkout_rate_limit(text,integer,integer) from anon;
revoke all on function public.consume_checkout_rate_limit(text,integer,integer) from authenticated;
grant execute on function public.consume_checkout_rate_limit(text,integer,integer) to service_role;

revoke all on table public.admin_users from anon;
revoke all on table public.pedidos from anon;
revoke all on table public.pedido_items from anon;
revoke all on table public.productos from anon;

grant select on table public.productos to anon;
grant select on table public.productos to authenticated;
grant insert, update, delete on table public.productos to authenticated;
grant select on table public.admin_users to authenticated;
grant select, update on table public.pedidos to authenticated;
grant select on table public.pedido_items to authenticated;
