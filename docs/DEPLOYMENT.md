# Deploy

## Plataforma

Producción y previews se despliegan mediante Vercel.

Demo actual:

https://dorado-art-pesca.vercel.app

## Variables de entorno

Usar `.env.example` como referencia. Los valores reales deben cargarse en Vercel y nunca versionarse.

### Supabase

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Aplicación

- `PUBLIC_SITE_URL`
- `RATE_LIMIT_SECRET`

### Mercado Pago

- `MERCADOPAGO_ENABLED`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_REQUIRE_SIGNATURE`

Mantener `MERCADOPAGO_ENABLED=false` hasta completar credenciales, webhook y una prueba real controlada.

### Email

- `GMAIL_USER=doradoartpesca@gmail.com`
- `GMAIL_APP_PASSWORD` — contraseña de aplicación de Google, nunca la contraseña normal de Gmail.
- `EMAIL_REPLY_TO=doradoartpesca@gmail.com`

Los emails automáticos cubren pedido/pago pendiente, pago aprobado y pago cancelado/rechazado. El enlace de pago pendiente vence a las 24 horas.

## Deploy recomendado

1. Ejecutar `npm run check`.
2. Confirmar que `git status` esté limpio.
3. Hacer push a `main`.
4. Esperar el deploy de Vercel.
5. Probar home, catálogo, carrito, checkout, seguimiento y Admin.
6. Revisar logs de Vercel si una función responde con error.

## Base de datos

Para una instalación nueva, seguir [../database/README.md](../database/README.md).

Para actualizar una base de Dorado ya existente, aplicar las migraciones idempotentes que correspondan. Para esta versión, `database/commerce-features.sql` agrega las funciones comerciales y `database/shipping-tracking.sql` agrega el seguimiento semiautomático de envíos. En la base conectada de Dorado, la migración de seguimiento ya fue aplicada.

## Antes de activar pagos

Completar [PRE_PRODUCTION_CHECKLIST.md](./PRE_PRODUCTION_CHECKLIST.md).
