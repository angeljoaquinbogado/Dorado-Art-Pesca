-- ============================================================
-- DORADO ARTÍCULOS DE PESCA — PARCHE FINAL PARA BASE NUEVA
-- Ejecutar DESPUÉS de supabase-setup.sql, upgrade-final.sql,
-- product-gallery.sql y security-hardening.sql.
-- ============================================================

-- Estado del email de confirmación. Permite reintentos sin duplicar envíos.
alter table public.pedidos
    add column if not exists email_confirmacion_estado text not null default 'pendiente',
    add column if not exists email_confirmacion_intentos integer not null default 0,
    add column if not exists email_confirmacion_actualizado timestamptz;

create or replace function public.claim_email_confirmacion(p_pedido_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_actualizado timestamptz;
begin
    select email_confirmacion_estado, email_confirmacion_actualizado
    into v_estado, v_actualizado
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        return jsonb_build_object('claimed', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_estado = 'enviado' then
        return jsonb_build_object('claimed', false, 'reason', 'ya_enviado');
    end if;

    if v_estado = 'enviando'
       and v_actualizado is not null
       and v_actualizado > now() - interval '5 minutes'
    then
        return jsonb_build_object('claimed', false, 'reason', 'en_proceso');
    end if;

    update public.pedidos
    set email_confirmacion_estado = 'enviando',
        email_confirmacion_intentos = email_confirmacion_intentos + 1,
        email_confirmacion_actualizado = now()
    where id = p_pedido_id;

    return jsonb_build_object('claimed', true);
end;
$$;

revoke all on function public.claim_email_confirmacion(uuid) from public;
revoke all on function public.claim_email_confirmacion(uuid) from anon;
revoke all on function public.claim_email_confirmacion(uuid) from authenticated;
grant execute on function public.claim_email_confirmacion(uuid) to service_role;

create or replace function public.finalizar_email_confirmacion(
    p_pedido_id uuid,
    p_enviado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.pedidos
    set email_confirmacion_estado = case when p_enviado then 'enviado' else 'pendiente' end,
        email_confirmacion_actualizado = now()
    where id = p_pedido_id;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    return jsonb_build_object('ok', true, 'sent', p_enviado);
end;
$$;

revoke all on function public.finalizar_email_confirmacion(uuid,boolean) from public;
revoke all on function public.finalizar_email_confirmacion(uuid,boolean) from anon;
revoke all on function public.finalizar_email_confirmacion(uuid,boolean) from authenticated;
grant execute on function public.finalizar_email_confirmacion(uuid,boolean) to service_role;

-- Confirmación de pago con bloqueo de productos en orden determinista.
-- Evita que dos pagos simultáneos descuenten la misma última unidad.
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
        return jsonb_build_object('ok', true, 'already_paid', true, 'payment_id', v_payment_id);
    end if;

    if v_estado = 'pagado_revisar_stock' then
        return jsonb_build_object('ok', false, 'already_processed', true, 'reason', 'stock_en_revision');
    end if;

    if v_estado in ('reembolsado', 'contracargo') then
        return jsonb_build_object('ok', false, 'blocked', true, 'reason', 'estado_terminal');
    end if;

    -- Bloquea todos los productos involucrados antes de verificar stock.
    perform p.id
    from public.productos p
    join (
        select producto_id, sum(cantidad)::integer as cantidad
        from public.pedido_items
        where pedido_id = p_pedido_id
        group by producto_id
    ) i on i.producto_id = p.id
    order by p.id
    for update;

    select exists(
        select 1
        from (
            select producto_id, sum(cantidad)::integer as cantidad
            from public.pedido_items
            where pedido_id = p_pedido_id
            group by producto_id
        ) i
        left join public.productos p on p.id = i.producto_id
        where p.id is null or p.stock < i.cantidad
    ) into v_falta_stock;

    if v_falta_stock then
        update public.pedidos
        set estado = 'pagado_revisar_stock',
            mp_payment_id = p_payment_id
        where id = p_pedido_id;
        return jsonb_build_object('ok', false, 'reason', 'stock_insuficiente');
    end if;

    update public.productos p
    set stock = p.stock - i.cantidad,
        updated_at = now()
    from (
        select producto_id, sum(cantidad)::integer as cantidad
        from public.pedido_items
        where pedido_id = p_pedido_id
        group by producto_id
    ) i
    where i.producto_id = p.id;

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

-- El Admin puede leer pedidos pero desde el navegador solo modificar
-- el estado de preparación, nunca el estado de pago ni sus importes.
revoke update on table public.pedidos from authenticated;
grant select on table public.pedidos to authenticated;
grant update (preparacion_estado) on table public.pedidos to authenticated;
grant select on table public.pedido_items to authenticated;
