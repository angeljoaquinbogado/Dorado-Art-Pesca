-- ============================================================
-- DORADO ARTÍCULOS DE PESCA
-- Descuentos de productos + cupones + emails de estado de pago
-- Ejecutar UNA VEZ en Supabase SQL Editor sobre la base actual.
-- Es idempotente: puede volver a ejecutarse si una ejecución se corta.
-- ============================================================

-- 1) Descuentos por producto -------------------------------------------------
alter table public.productos
    add column if not exists descuento_porcentaje numeric(5,2) not null default 0;

update public.productos
set descuento_porcentaje = 0
where descuento_porcentaje is null;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'productos_descuento_porcentaje_check'
    ) then
        alter table public.productos
            add constraint productos_descuento_porcentaje_check
            check (descuento_porcentaje >= 0 and descuento_porcentaje <= 90);
    end if;
end $$;

-- 2) Cupones ----------------------------------------------------------------
create table if not exists public.cupones (
    id uuid primary key default gen_random_uuid(),
    codigo text not null,
    tipo text not null default 'porcentaje',
    valor numeric(12,2) not null,
    minimo_compra numeric(12,2) not null default 0,
    activo boolean not null default true,
    vigente_desde timestamptz,
    vigente_hasta timestamptz,
    limite_usos integer,
    usos integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint cupones_codigo_formato_check check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9_-]{1,40}$'),
    constraint cupones_tipo_check check (tipo in ('porcentaje','fijo')),
    constraint cupones_valor_check check (valor > 0),
    constraint cupones_minimo_check check (minimo_compra >= 0),
    constraint cupones_limite_check check (limite_usos is null or limite_usos > 0),
    constraint cupones_usos_check check (usos >= 0),
    constraint cupones_fechas_check check (vigente_hasta is null or vigente_desde is null or vigente_hasta > vigente_desde),
    constraint cupones_porcentaje_check check (tipo <> 'porcentaje' or valor <= 100)
);

create unique index if not exists cupones_codigo_uidx on public.cupones (upper(codigo));
create index if not exists cupones_activo_idx on public.cupones (activo);

alter table public.cupones enable row level security;

drop policy if exists "Admins can view coupons" on public.cupones;
create policy "Admins can view coupons"
on public.cupones for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert coupons" on public.cupones;
create policy "Admins can insert coupons"
on public.cupones for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update coupons" on public.cupones;
create policy "Admins can update coupons"
on public.cupones for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete coupons" on public.cupones;
create policy "Admins can delete coupons"
on public.cupones for delete
to authenticated
using (public.is_admin());

revoke all on table public.cupones from anon;
grant select, insert, update, delete on table public.cupones to authenticated;
grant select, insert, update, delete on table public.cupones to service_role;

-- 3) Datos económicos y reintento de pago en pedidos -------------------------
alter table public.pedidos
    add column if not exists subtotal numeric(12,2) not null default 0,
    add column if not exists descuento_total numeric(12,2) not null default 0,
    add column if not exists cupon_id uuid,
    add column if not exists cupon_codigo text,
    add column if not exists mp_init_point text,
    add column if not exists pago_expira_at timestamptz;

update public.pedidos
set subtotal = total
where subtotal = 0 and coalesce(total,0) > 0;

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'pedidos_descuento_total_check'
    ) then
        alter table public.pedidos
            add constraint pedidos_descuento_total_check check (descuento_total >= 0);
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'pedidos_subtotal_check'
    ) then
        alter table public.pedidos
            add constraint pedidos_subtotal_check check (subtotal >= 0);
    end if;

    if not exists (
        select 1 from pg_constraint where conname = 'pedidos_cupon_id_fkey'
    ) then
        alter table public.pedidos
            add constraint pedidos_cupon_id_fkey
            foreign key (cupon_id) references public.cupones(id) on delete set null;
    end if;
end $$;

create index if not exists pedidos_cupon_id_idx on public.pedidos(cupon_id);
create index if not exists pedidos_pago_expira_at_idx on public.pedidos(pago_expira_at);

-- El backend server-side necesita estas columnas para checkout/webhooks.
grant select, insert, update on table public.pedidos to service_role;
grant select, insert on table public.pedido_items to service_role;
grant select, update on table public.productos to service_role;

-- 4) Control de emails por evento (evita duplicados de webhooks) -------------
create table if not exists public.pedido_email_eventos (
    pedido_id uuid not null references public.pedidos(id) on delete cascade,
    tipo text not null,
    estado text not null default 'pendiente',
    intentos integer not null default 0,
    actualizado_at timestamptz not null default now(),
    primary key (pedido_id, tipo),
    constraint pedido_email_tipo_check check (tipo in ('pending','confirmed','cancelled','refunded')),
    constraint pedido_email_estado_check check (estado in ('pendiente','enviando','enviado')),
    constraint pedido_email_intentos_check check (intentos >= 0)
);

alter table public.pedido_email_eventos enable row level security;
revoke all on table public.pedido_email_eventos from anon, authenticated;
grant select, insert, update on table public.pedido_email_eventos to service_role;

create or replace function public.claim_order_email(
    p_pedido_id uuid,
    p_tipo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_estado text;
    v_actualizado timestamptz;
begin
    if p_tipo not in ('pending','confirmed','cancelled','refunded') then
        return jsonb_build_object('claimed', false, 'reason', 'tipo_invalido');
    end if;

    insert into public.pedido_email_eventos (pedido_id, tipo)
    values (p_pedido_id, p_tipo)
    on conflict (pedido_id, tipo) do nothing;

    select estado, actualizado_at
      into v_estado, v_actualizado
      from public.pedido_email_eventos
     where pedido_id = p_pedido_id and tipo = p_tipo
     for update;

    if not found then
        return jsonb_build_object('claimed', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_estado = 'enviado' then
        return jsonb_build_object('claimed', false, 'reason', 'ya_enviado');
    end if;

    if v_estado = 'enviando'
       and v_actualizado > now() - interval '5 minutes'
    then
        return jsonb_build_object('claimed', false, 'reason', 'en_proceso');
    end if;

    update public.pedido_email_eventos
       set estado = 'enviando',
           intentos = intentos + 1,
           actualizado_at = now()
     where pedido_id = p_pedido_id and tipo = p_tipo;

    return jsonb_build_object('claimed', true);
end;
$$;

revoke all on function public.claim_order_email(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_order_email(uuid,text) to service_role;

create or replace function public.finalize_order_email(
    p_pedido_id uuid,
    p_tipo text,
    p_enviado boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.pedido_email_eventos
       set estado = case when p_enviado then 'enviado' else 'pendiente' end,
           actualizado_at = now()
     where pedido_id = p_pedido_id and tipo = p_tipo;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'evento_no_encontrado');
    end if;

    return jsonb_build_object('ok', true, 'sent', p_enviado);
end;
$$;

revoke all on function public.finalize_order_email(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.finalize_order_email(uuid,text,boolean) to service_role;

-- 5) Confirmación de pago: mantiene el control de stock actual y registra
--    un uso de cupón una sola vez cuando el pedido pasa a PAGADO. ------------
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
    v_cupon_id uuid;
begin
    select estado, mp_payment_id, cupon_id
      into v_estado, v_payment_id, v_cupon_id
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

    if v_cupon_id is not null then
        update public.cupones
           set usos = usos + 1,
               updated_at = now()
         where id = v_cupon_id;
    end if;

    update public.pedidos
       set estado = 'pagado',
           mp_payment_id = p_payment_id
     where id = p_pedido_id;

    return jsonb_build_object('ok', true, 'paid', true);
end;
$$;

revoke all on function public.confirmar_pago_pedido(uuid,text) from public, anon, authenticated;
grant execute on function public.confirmar_pago_pedido(uuid,text) to service_role;

-- 6) Refrescar permisos del panel para descuento de productos ----------------
grant select, insert, update, delete on table public.productos to authenticated;

-- Fin.
