-- ============================================================
-- Dorado Artículos de Pesca — HARDENING DE SEGURIDAD
-- Ejecutar una sola vez en Supabase SQL Editor.
-- Compatible con la estructura actual.
-- ============================================================

-- 1) Rate limit genérico para APIs server-side.
create table if not exists public.api_rate_limits (
    key_hash text primary key,
    window_started_at timestamptz not null default now(),
    request_count integer not null default 0 check (request_count >= 0),
    updated_at timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;

revoke all on table public.api_rate_limits from anon;
revoke all on table public.api_rate_limits from authenticated;

create or replace function public.consume_api_rate_limit(
    p_key_hash text,
    p_limit integer default 30,
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
       or p_limit > 500
       or p_window_seconds < 30
       or p_window_seconds > 86400
    then
        raise exception 'invalid_rate_limit_input';
    end if;

    insert into public.api_rate_limits (
        key_hash,
        window_started_at,
        request_count,
        updated_at
    )
    values (
        p_key_hash,
        v_now,
        1,
        v_now
    )
    on conflict (key_hash) do update
    set
        window_started_at = case
            when public.api_rate_limits.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            then v_now
            else public.api_rate_limits.window_started_at
        end,
        request_count = case
            when public.api_rate_limits.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            then 1
            else public.api_rate_limits.request_count + 1
        end,
        updated_at = v_now
    returning window_started_at, request_count
    into v_started, v_count;

    if v_count > p_limit then
        v_retry := greatest(
            1,
            ceil(extract(epoch from (
                v_started
                + make_interval(secs => p_window_seconds)
                - v_now
            )))::integer
        );

        return jsonb_build_object(
            'allowed', false,
            'retry_after', v_retry,
            'count', v_count
        );
    end if;

    delete from public.api_rate_limits
    where updated_at < v_now - interval '24 hours';

    return jsonb_build_object(
        'allowed', true,
        'retry_after', 0,
        'count', v_count
    );
end;
$$;

revoke all on function public.consume_api_rate_limit(text,integer,integer) from public;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from anon;
revoke all on function public.consume_api_rate_limit(text,integer,integer) from authenticated;
grant execute on function public.consume_api_rate_limit(text,integer,integer) to service_role;


-- 2) Confirmación de pago reforzada.
-- Evita que un webhook tardío vuelva a descontar stock después de
-- un reembolso/contracargo o vuelva a procesar un pedido ya resuelto.
create or replace function public.confirmar_pago_pedido(
    p_pedido_id uuid,
    p_payment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_payment_id text;
    v_falta_stock boolean;
begin
    select estado, mp_payment_id
    into v_estado, v_payment_id
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_estado = 'pagado' then
        return jsonb_build_object(
            'ok', true,
            'already_paid', true,
            'payment_id', v_payment_id
        );
    end if;

    if v_estado = 'pagado_revisar_stock' then
        return jsonb_build_object(
            'ok', false,
            'already_processed', true,
            'reason', 'stock_en_revision'
        );
    end if;

    if v_estado in ('reembolsado', 'contracargo') then
        return jsonb_build_object(
            'ok', false,
            'blocked', true,
            'reason', 'estado_terminal'
        );
    end if;

    select exists(
        select 1
        from public.pedido_items i
        left join public.productos p on p.id = i.producto_id
        where i.pedido_id = p_pedido_id
          and (p.id is null or p.stock < i.cantidad)
    )
    into v_falta_stock;

    if v_falta_stock then
        update public.pedidos
        set estado = 'pagado_revisar_stock',
            mp_payment_id = p_payment_id
        where id = p_pedido_id;

        return jsonb_build_object(
            'ok', false,
            'reason', 'stock_insuficiente'
        );
    end if;

    update public.productos p
    set stock = p.stock - i.cantidad,
        updated_at = now()
    from public.pedido_items i
    where i.pedido_id = p_pedido_id
      and i.producto_id = p.id;

    update public.pedidos
    set estado = 'pagado',
        mp_payment_id = p_payment_id
    where id = p_pedido_id;

    return jsonb_build_object('ok', true, 'paid', true);
end;
$$;

revoke all on function public.confirmar_pago_pedido(uuid,text) from public;
revoke all on function public.confirmar_pago_pedido(uuid,text) from anon;
revoke all on function public.confirmar_pago_pedido(uuid,text) from authenticated;
grant execute on function public.confirmar_pago_pedido(uuid,text) to service_role;


-- 3) Transiciones seguras para estados no aprobados.
-- Un evento pendiente/rechazado/cancelado nunca puede degradar un pedido
-- que ya fue pagado o revertido.
create or replace function public.registrar_estado_pago(
    p_pedido_id uuid,
    p_payment_id text,
    p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_payment_id text;
    v_estado_nuevo text := lower(coalesce(p_estado, ''));
begin
    if v_estado_nuevo not in (
        'pago_pendiente',
        'pago_rechazado',
        'pago_cancelado',
        'pago_revisar_monto',
        'reembolsado',
        'contracargo'
    ) then
        return jsonb_build_object('ok', false, 'reason', 'estado_no_permitido');
    end if;

    select estado, mp_payment_id
    into v_estado, v_payment_id
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_estado in ('reembolsado', 'contracargo') then
        return jsonb_build_object(
            'ok', true,
            'ignored', true,
            'reason', 'estado_terminal'
        );
    end if;

    if v_estado_nuevo in ('reembolsado', 'contracargo') then
        if v_estado not in ('pagado', 'pagado_revisar_stock', 'pago_revisar_monto') then
            return jsonb_build_object(
                'ok', true,
                'ignored', true,
                'reason', 'pedido_no_pagado'
            );
        end if;

        if nullif(v_payment_id, '') is not null
           and nullif(p_payment_id, '') is not null
           and v_payment_id <> p_payment_id
        then
            return jsonb_build_object(
                'ok', true,
                'ignored', true,
                'reason', 'payment_id_no_coincide'
            );
        end if;

        update public.pedidos
        set estado = v_estado_nuevo,
            mp_payment_id = coalesce(nullif(v_payment_id, ''), p_payment_id)
        where id = p_pedido_id;

        return jsonb_build_object('ok', true, 'updated', true);
    end if;

    if v_estado in ('pagado', 'pagado_revisar_stock', 'pago_revisar_monto') then
        return jsonb_build_object(
            'ok', true,
            'ignored', true,
            'reason', 'no_degradar_estado_pagado'
        );
    end if;

    update public.pedidos
    set estado = v_estado_nuevo,
        mp_payment_id = coalesce(nullif(p_payment_id, ''), mp_payment_id)
    where id = p_pedido_id;

    return jsonb_build_object('ok', true, 'updated', true);
end;
$$;

revoke all on function public.registrar_estado_pago(uuid,text,text) from public;
revoke all on function public.registrar_estado_pago(uuid,text,text) from anon;
revoke all on function public.registrar_estado_pago(uuid,text,text) from authenticated;
grant execute on function public.registrar_estado_pago(uuid,text,text) to service_role;
