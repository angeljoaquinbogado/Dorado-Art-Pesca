-- DORADO ARTÍCULOS DE PESCA
-- Hardening adicional auditado el 2026-09-26.
-- Seguro para ejecutar más de una vez.

begin;

-- is_admin no necesita privilegios elevados: RLS de admin_users ya permite
-- que cada usuario autenticado consulte únicamente su propia fila.
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

-- Esta función es un event trigger interno y no debe ser invocable desde la API.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

-- Evita reevaluar auth.uid() por cada fila.
drop policy if exists "Admin can read own admin row" on public.admin_users;
create policy "Admin can read own admin row"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

-- El borrado administrativo usa privilegios del usuario autenticado y RLS,
-- en lugar de elevar permisos con SECURITY DEFINER.
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

    if p_ids is null
       or coalesce(array_length(p_ids, 1), 0) = 0
       or coalesce(array_length(p_ids, 1), 0) > 200 then
        raise exception 'invalid_order_ids' using errcode = '22023';
    end if;

    delete from public.pedidos
    where id = any(p_ids);

    get diagnostics v_deleted = row_count;
    return v_deleted;
end;
$$;

revoke all on function public.admin_delete_orders(uuid[]) from public, anon;
grant execute on function public.admin_delete_orders(uuid[]) to authenticated;

-- Índice faltante detectado por el advisor de rendimiento de Supabase.
create index if not exists pedido_items_producto_id_idx
on public.pedido_items(producto_id);

commit;
