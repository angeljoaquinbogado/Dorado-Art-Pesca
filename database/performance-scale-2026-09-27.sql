-- ============================================================
-- DORADO — performance / scale indexes (2026-09-27)
-- Idempotente. No borra ni modifica datos existentes.
-- Ejecutar en Supabase SQL Editor antes de una etapa de tráfico alto.
-- ============================================================

-- Catálogo público: /api/products filtra activo y ordena por id.
create index if not exists productos_activo_id_idx
  on public.productos (activo, id);

-- Más elegidos: localiza primero los últimos pedidos pagados.
create index if not exists pedidos_estado_created_at_idx
  on public.pedidos (estado, created_at desc);

-- Ítems de los pedidos elegidos; mantiene la consulta agrupada barata.
create index if not exists pedido_items_pedido_producto_idx
  on public.pedido_items (pedido_id, producto_id);

-- Reseñas públicas activas ordenadas por id.
create index if not exists resenas_google_activa_id_idx
  on public.resenas_google (activa, id);
