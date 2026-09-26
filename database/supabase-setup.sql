-- ============================================================
-- Dorado Artículos de Pesca - CONFIGURACIÓN SEGURA DE SUPABASE
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Antes: crear el usuario administrador en Authentication > Users.
-- Después: reemplazar ADMIN_EMAIL_AQUI por su email y ejecutar
-- solamente el bloque final de "DAR PERMISO DE ADMIN".
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Tabla de administradores
create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Admin can read own admin row" on public.admin_users;
create policy "Admin can read own admin row"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

-- Función segura reutilizable por las políticas
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists(
        select 1
        from public.admin_users
        where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 2) Productos: completar columnas si faltan
alter table public.productos
    add column if not exists descripcion text,
    add column if not exists caracteristicas text,
    add column if not exists precio numeric(12,2) not null default 0,
    add column if not exists imagen text,
    add column if not exists categoria text,
    add column if not exists stock integer not null default 0,
    add column if not exists activo boolean not null default true,
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists updated_at timestamptz not null default now();

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'productos_precio_no_negativo'
          and conrelid = 'public.productos'::regclass
    ) then
        alter table public.productos
            add constraint productos_precio_no_negativo check (precio >= 0) not valid;
        alter table public.productos validate constraint productos_precio_no_negativo;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'productos_stock_no_negativo'
          and conrelid = 'public.productos'::regclass
    ) then
        alter table public.productos
            add constraint productos_stock_no_negativo check (stock >= 0) not valid;
        alter table public.productos validate constraint productos_stock_no_negativo;
    end if;
end $$;

alter table public.productos enable row level security;

drop policy if exists "Public can view active products" on public.productos;
create policy "Public can view active products"
on public.productos
for select
to anon, authenticated
using (activo = true or public.is_admin());

drop policy if exists "Admins can insert products" on public.productos;
create policy "Admins can insert products"
on public.productos
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update products" on public.productos;
create policy "Admins can update products"
on public.productos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete products" on public.productos;
create policy "Admins can delete products"
on public.productos
for delete
to authenticated
using (public.is_admin());

-- 3) Pedidos
create table if not exists public.pedidos (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    cliente_nombre text not null,
    cliente_email text not null,
    cliente_telefono text not null,
    domicilio text not null,
    ciudad text not null,
    provincia text not null,
    codigo_postal text not null,
    metodo_entrega text not null default 'retiro',
    notas text,
    total numeric(12,2) not null check (total >= 0),
    estado text not null default 'pendiente',
    preparacion_estado text not null default 'nuevo',
    tracking_token uuid not null default gen_random_uuid(),
    mp_preference_id text,
    mp_payment_id text
);

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

create index if not exists pedidos_created_at_idx
on public.pedidos(created_at desc);

create index if not exists pedidos_estado_idx
on public.pedidos(estado);

alter table public.pedidos enable row level security;

drop policy if exists "Admins can view orders" on public.pedidos;
create policy "Admins can view orders"
on public.pedidos
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update orders" on public.pedidos;
create policy "Admins can update orders"
on public.pedidos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- No se habilita INSERT/DELETE al navegador.
-- Los pedidos se crean y actualizan solo desde las funciones de Vercel
-- usando SUPABASE_SERVICE_ROLE_KEY.

-- 4) Ítems de pedido
create table if not exists public.pedido_items (
    id bigint generated by default as identity primary key,
    pedido_id uuid not null references public.pedidos(id) on delete cascade,
    producto_id bigint references public.productos(id) on delete set null,
    nombre text not null,
    cantidad integer not null check (cantidad > 0),
    precio_unitario numeric(12,2) not null check (precio_unitario >= 0)
);

create index if not exists pedido_items_pedido_id_idx
on public.pedido_items(pedido_id);

alter table public.pedido_items enable row level security;

drop policy if exists "Admins can view order items" on public.pedido_items;
create policy "Admins can view order items"
on public.pedido_items
for select
to authenticated
using (public.is_admin());

-- 5) Confirmación atómica del pago y descuento de stock.
-- El webhook llama esta función solamente después de verificar el pago
-- consultando directamente a Mercado Pago con el token privado.
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
    v_falta_stock boolean;
begin
    select estado
    into v_estado
    from public.pedidos
    where id = p_pedido_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'reason', 'pedido_no_encontrado');
    end if;

    if v_estado = 'pagado' then
        return jsonb_build_object('ok', true, 'already_paid', true);
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

        return jsonb_build_object('ok', false, 'reason', 'stock_insuficiente');
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

-- 6) Borrado seguro de pedidos desde el panel.
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
           select 1
           from public.admin_users
           where user_id = auth.uid()
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

-- 7) Límite anti-spam del checkout.
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
            ceil(
                extract(
                    epoch from (
                        v_started
                        + make_interval(secs => p_window_seconds)
                        - v_now
                    )
                )
            )::integer
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

-- 8) Privilegios de tablas. RLS sigue siendo la barrera de autorización.
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

-- 9) Storage para imágenes de productos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'productos',
    'productos',
    true,
    5242880,
    array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view product images" on storage.objects;
create policy "Public can view product images"
on storage.objects
for select
to public
using (bucket_id = 'productos');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'productos'
    and public.is_admin()
);

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'productos'
    and public.is_admin()
)
with check (
    bucket_id = 'productos'
    and public.is_admin()
);

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'productos'
    and public.is_admin()
);

-- ============================================================
-- DAR PERMISO DE ADMIN
-- 1. Crear primero el usuario en Supabase > Authentication > Users.
-- 2. Cambiar el email de abajo.
-- 3. Ejecutar SOLO este bloque.
-- ============================================================

-- insert into public.admin_users (user_id)
-- select id
-- from auth.users
-- where lower(email) = lower('ADMIN_EMAIL_AQUI')
-- on conflict (user_id) do nothing;

-- =========================================================
-- HARDENING FINAL 2026-09-26
-- =========================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
    select exists(
        select 1
        from public.admin_users
        where user_id = (select auth.uid())
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admin can read own admin row" on public.admin_users;
create policy "Admin can read own admin row"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can delete orders" on public.pedidos;
create policy "Admins can delete orders"
on public.pedidos
for delete
to authenticated
using (public.is_admin());

grant delete on table public.pedidos to authenticated;

create or replace function public.admin_delete_orders(p_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_deleted integer := 0;
begin
    if (select auth.uid()) is null or not public.is_admin() then
        raise exception 'not_authorized' using errcode = '42501';
    end if;
    if p_ids is null or coalesce(array_length(p_ids,1),0)=0 or coalesce(array_length(p_ids,1),0)>200 then
        raise exception 'invalid_order_ids' using errcode = '22023';
    end if;
    delete from public.pedidos where id = any(p_ids);
    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

revoke all on function public.admin_delete_orders(uuid[]) from public, anon;
grant execute on function public.admin_delete_orders(uuid[]) to authenticated;

create index if not exists pedido_items_producto_id_idx on public.pedido_items(producto_id);

