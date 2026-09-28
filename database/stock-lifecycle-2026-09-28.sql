-- Dorado Artículos de Pesca
-- Ciclo de stock seguro para pagos, cancelaciones y reembolsos.
-- Aplicado en producción el 2026-09-28.
--
-- Reglas:
-- 1) El stock sólo se descuenta al confirmar un pago aprobado.
-- 2) Un pedido/pago cancelado no conserva stock descontado.
-- 3) Un reembolso devuelve el stock exactamente una vez.
-- 4) Cancelar desde Admin devuelve stock; reactivar un pedido pagado lo reserva otra vez.
-- 5) Los contracargos no suman stock automáticamente porque no prueban devolución física.

alter table public.pedidos
    add column if not exists stock_descontado boolean not null default false,
    add column if not exists stock_restaurado_at timestamptz;

update public.pedidos
   set stock_descontado = true
 where estado = 'pagado'
   and stock_descontado = false;

CREATE OR REPLACE FUNCTION public.confirmar_pago_pedido(p_pedido_id uuid, p_payment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_estado text;
    v_payment_id text;
    v_falta_stock boolean;
    v_cupon_id uuid;
    v_stock_descontado boolean;
    v_preparacion_estado text;
begin
    select estado, mp_payment_id, cupon_id, stock_descontado, preparacion_estado
      into v_estado, v_payment_id, v_cupon_id, v_stock_descontado, v_preparacion_estado
      from public.pedidos
     where id = p_pedido_id
     for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    -- Un webhook duplicado nunca vuelve a descontar stock.
    if v_estado = 'pagado' then
        return jsonb_build_object(
            'ok', true,
            'already_paid', true,
            'payment_id', v_payment_id,
            'stock_descontado', v_stock_descontado
        );
    end if;

    if v_estado in ('pagado_revisar_stock', 'pagado_cancelado_revisar') then
        return jsonb_build_object(
            'ok', false,
            'already_processed', true,
            'reason', case
                when v_estado = 'pagado_cancelado_revisar' then 'pedido_cancelado'
                else 'stock_en_revision'
            end
        );
    end if;

    if v_estado in ('reembolsado', 'contracargo') then
        return jsonb_build_object('ok', false, 'blocked', true, 'reason', 'estado_terminal');
    end if;

    -- Si el pedido o el pago ya estaban cancelados, un pago aprobado tardío
    -- se marca para revisión y NO toca el stock.
    if v_estado = 'pago_cancelado' or v_preparacion_estado = 'cancelado' then
        update public.pedidos
           set estado = 'pagado_cancelado_revisar',
               mp_payment_id = p_payment_id,
               stock_descontado = false
         where id = p_pedido_id;

        return jsonb_build_object(
            'ok', false,
            'review', true,
            'reason', 'pedido_cancelado',
            'stock_descontado', false
        );
    end if;

    -- Bloqueo de productos para hacer el descuento de forma atómica.
    perform p.id
      from public.productos p
     where p.id in (
         select pi.producto_id
           from public.pedido_items pi
          where pi.pedido_id = p_pedido_id
     )
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
               mp_payment_id = p_payment_id,
               stock_descontado = false
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

    if v_cupon_id is not null then
        update public.cupones
           set usos = usos + 1,
               updated_at = now()
         where id = v_cupon_id;
    end if;

    update public.pedidos
       set estado = 'pagado',
           mp_payment_id = p_payment_id,
           stock_descontado = true,
           stock_restaurado_at = null
     where id = p_pedido_id;

    return jsonb_build_object(
        'ok', true,
        'paid', true,
        'stock_descontado', true
    );
end;
$function$


revoke all on function public.confirmar_pago_pedido(uuid,text) from public;
revoke all on function public.confirmar_pago_pedido(uuid,text) from anon;
revoke all on function public.confirmar_pago_pedido(uuid,text) from authenticated;
grant execute on function public.confirmar_pago_pedido(uuid,text) to service_role;

CREATE OR REPLACE FUNCTION public.registrar_estado_pago(p_pedido_id uuid, p_payment_id text, p_estado text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_estado text;
    v_payment_id text;
    v_stock_descontado boolean;
    v_estado_nuevo text := lower(coalesce(p_estado, ''));
    v_stock_restaurado boolean := false;
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

    select estado, mp_payment_id, stock_descontado
      into v_estado, v_payment_id, v_stock_descontado
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
            'reason', 'estado_terminal',
            'stock_restaurado', false
        );
    end if;

    -- Evita que una notificación de otro pago modifique este pedido.
    if nullif(v_payment_id, '') is not null
       and nullif(p_payment_id, '') is not null
       and v_payment_id <> p_payment_id
       and v_estado_nuevo in ('pago_cancelado', 'reembolsado', 'contracargo')
    then
        return jsonb_build_object(
            'ok', true,
            'ignored', true,
            'reason', 'payment_id_no_coincide',
            'stock_restaurado', false
        );
    end if;

    -- REEMBOLSO:
    -- si el stock fue descontado al aprobar el pago, vuelve exactamente una vez.
    if v_estado_nuevo = 'reembolsado' then
        if v_estado not in (
            'pagado',
            'pagado_revisar_stock',
            'pago_revisar_monto',
            'pagado_cancelado_revisar'
        ) then
            return jsonb_build_object(
                'ok', true,
                'ignored', true,
                'reason', 'pedido_no_pagado',
                'stock_restaurado', false
            );
        end if;

        if v_stock_descontado then
            perform p.id
              from public.productos p
             where p.id in (
                 select pi.producto_id
                   from public.pedido_items pi
                  where pi.pedido_id = p_pedido_id
             )
             order by p.id
             for update;

            update public.productos p
               set stock = p.stock + i.cantidad,
                   updated_at = now()
              from (
                  select producto_id, sum(cantidad)::integer as cantidad
                    from public.pedido_items
                   where pedido_id = p_pedido_id
                   group by producto_id
              ) i
             where i.producto_id = p.id;

            v_stock_restaurado := true;
        end if;

        update public.pedidos
           set estado = 'reembolsado',
               mp_payment_id = coalesce(nullif(v_payment_id, ''), p_payment_id),
               stock_descontado = false,
               stock_restaurado_at = case
                   when v_stock_restaurado then now()
                   else stock_restaurado_at
               end
         where id = p_pedido_id;

        return jsonb_build_object(
            'ok', true,
            'updated', true,
            'stock_restaurado', v_stock_restaurado
        );
    end if;

    -- CONTRACARGO no implica que la mercadería haya vuelto físicamente.
    -- Se cambia el estado financiero, pero no se suma stock automáticamente.
    if v_estado_nuevo = 'contracargo' then
        if v_estado not in (
            'pagado',
            'pagado_revisar_stock',
            'pago_revisar_monto',
            'pagado_cancelado_revisar'
        ) then
            return jsonb_build_object(
                'ok', true,
                'ignored', true,
                'reason', 'pedido_no_pagado'
            );
        end if;

        update public.pedidos
           set estado = 'contracargo',
               mp_payment_id = coalesce(nullif(v_payment_id, ''), p_payment_id)
         where id = p_pedido_id;

        return jsonb_build_object(
            'ok', true,
            'updated', true,
            'stock_restaurado', false
        );
    end if;

    -- PAGO CANCELADO:
    -- normalmente todavía no había stock descontado. Si por una carrera de
    -- eventos sí lo había, se restaura para garantizar la regla del negocio.
    if v_estado_nuevo = 'pago_cancelado' then
        if v_stock_descontado then
            perform p.id
              from public.productos p
             where p.id in (
                 select pi.producto_id
                   from public.pedido_items pi
                  where pi.pedido_id = p_pedido_id
             )
             order by p.id
             for update;

            update public.productos p
               set stock = p.stock + i.cantidad,
                   updated_at = now()
              from (
                  select producto_id, sum(cantidad)::integer as cantidad
                    from public.pedido_items
                   where pedido_id = p_pedido_id
                   group by producto_id
              ) i
             where i.producto_id = p.id;

            v_stock_restaurado := true;
        end if;

        update public.pedidos
           set estado = 'pago_cancelado',
               mp_payment_id = coalesce(nullif(p_payment_id, ''), mp_payment_id),
               stock_descontado = false,
               stock_restaurado_at = case
                   when v_stock_restaurado then now()
                   else stock_restaurado_at
               end
         where id = p_pedido_id;

        return jsonb_build_object(
            'ok', true,
            'updated', true,
            'stock_restaurado', v_stock_restaurado
        );
    end if;

    -- Estados intermedios o rechazo nunca deben degradar un pago ya confirmado.
    if v_estado in (
        'pagado',
        'pagado_revisar_stock',
        'pago_revisar_monto',
        'pagado_cancelado_revisar'
    ) then
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

    return jsonb_build_object(
        'ok', true,
        'updated', true,
        'stock_restaurado', false
    );
end;
$function$


revoke all on function public.registrar_estado_pago(uuid,text,text) from public;
revoke all on function public.registrar_estado_pago(uuid,text,text) from anon;
revoke all on function public.registrar_estado_pago(uuid,text,text) from authenticated;
grant execute on function public.registrar_estado_pago(uuid,text,text) to service_role;

CREATE OR REPLACE FUNCTION public.admin_actualizar_preparacion_pedido(p_pedido_id uuid, p_preparacion_estado text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
    v_estado text;
    v_preparacion_actual text;
    v_stock_descontado boolean;
    v_estado_nuevo text := lower(coalesce(p_preparacion_estado, ''));
    v_falta_stock boolean;
begin
    if (select auth.uid()) is null or not public.is_admin() then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if v_estado_nuevo not in ('nuevo','preparando','enviado','entregado','cancelado') then
        return jsonb_build_object('ok', false, 'reason', 'estado_no_permitido');
    end if;

    select estado, preparacion_estado, stock_descontado
      into v_estado, v_preparacion_actual, v_stock_descontado
      from public.pedidos
     where id = p_pedido_id
     for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_preparacion_actual = v_estado_nuevo then
        return jsonb_build_object(
            'ok', true,
            'unchanged', true,
            'stock_restaurado', false
        );
    end if;

    -- Cancelar un pedido devuelve el stock si ese stock había sido reservado
    -- al aprobar el pago. Si nunca se descontó, no toca productos.
    if v_estado_nuevo = 'cancelado' then
        if v_stock_descontado then
            perform p.id
              from public.productos p
             where p.id in (
                 select pi.producto_id
                   from public.pedido_items pi
                  where pi.pedido_id = p_pedido_id
             )
             order by p.id
             for update;

            update public.productos p
               set stock = p.stock + i.cantidad,
                   updated_at = now()
              from (
                  select producto_id, sum(cantidad)::integer as cantidad
                    from public.pedido_items
                   where pedido_id = p_pedido_id
                   group by producto_id
              ) i
             where i.producto_id = p.id;

            update public.pedidos
               set preparacion_estado = 'cancelado',
                   stock_descontado = false,
                   stock_restaurado_at = now()
             where id = p_pedido_id;

            return jsonb_build_object(
                'ok', true,
                'updated', true,
                'stock_restaurado', true
            );
        end if;

        update public.pedidos
           set preparacion_estado = 'cancelado'
         where id = p_pedido_id;

        return jsonb_build_object(
            'ok', true,
            'updated', true,
            'stock_restaurado', false
        );
    end if;

    -- Si un pedido PAGADO cancelado se reactiva, reserva el stock nuevamente.
    if v_preparacion_actual = 'cancelado'
       and v_estado = 'pagado'
       and not v_stock_descontado
    then
        perform p.id
          from public.productos p
         where p.id in (
             select pi.producto_id
               from public.pedido_items pi
              where pi.pedido_id = p_pedido_id
         )
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
            return jsonb_build_object(
                'ok', false,
                'reason', 'stock_insuficiente_reactivar'
            );
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
           set preparacion_estado = v_estado_nuevo,
               stock_descontado = true,
               stock_restaurado_at = null
         where id = p_pedido_id;

        return jsonb_build_object(
            'ok', true,
            'updated', true,
            'stock_descontado', true
        );
    end if;

    update public.pedidos
       set preparacion_estado = v_estado_nuevo
     where id = p_pedido_id;

    return jsonb_build_object('ok', true, 'updated', true);
end;
$function$


revoke all on function public.admin_actualizar_preparacion_pedido(uuid,text) from public;
revoke all on function public.admin_actualizar_preparacion_pedido(uuid,text) from anon;
grant execute on function public.admin_actualizar_preparacion_pedido(uuid,text) to authenticated;
