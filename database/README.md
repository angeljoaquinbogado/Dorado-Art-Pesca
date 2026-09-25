# Base de datos

Los scripts de este directorio corresponden a Supabase/PostgreSQL.

## Instalación nueva

Para una base nueva, el punto de entrada recomendado es:

```text
dorado-complete-setup.sql
```

Este archivo agrupa la configuración base del proyecto e incluye tablas, RLS y funciones necesarias para Dorado.

Antes de ejecutar scripts sobre producción, revisar siempre su contenido y tener una copia o backup del entorno.

## Scripts

### `dorado-complete-setup.sql`

Bootstrap principal para una instalación nueva. Crea o completa tablas como productos, pedidos y administradores, y configura políticas de acceso.

### `upgrade-final.sql`

Upgrade idempotente para instalaciones existentes. Añade, entre otras cosas, tracking, funciones administrativas y rate limiting del checkout.

### `product-gallery.sql`

Añade soporte para múltiples imágenes por producto manteniendo `imagen` como imagen principal por compatibilidad.

### `security-hardening.sql`

Refuerza seguridad y rate limiting para operaciones server-side.

### `dorado-final-hardening.sql`

Capa final de hardening. Incluye control del estado de confirmación por email para reducir duplicados y otras protecciones.

### `promotions-and-email-status.sql`

Agrega descuentos por producto, cupones administrables, vencimiento de pago a 24 horas y deduplicación de emails por evento de pago. Para instalaciones nuevas ya está incluido al final de `dorado-complete-setup.sql`.

### `seed-demo-product.sql`

Producto de referencia opcional. Se crea oculto y no debe utilizarse como inventario real.

## Admin

El usuario de Authentication que gestione el comercio debe autorizarse en `admin_users`. No usar service role en el navegador.

## Reglas

- Nunca guardar claves privadas en SQL versionado.
- Mantener RLS activado en tablas expuestas.
- Ejecutar migraciones primero en un entorno controlado.
- Verificar funciones `security definer` y su `search_path`.
- No usar el producto demo como catálogo productivo.
