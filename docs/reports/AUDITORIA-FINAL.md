# Auditoría final — DORADO ARTÍCULOS DE PESCA

Fecha: 2026-09-26

## Resultado

Se revisó el proyecto completo del ZIP entregado, manteniendo identidad visual, estructura general y flujo de compra. No se realizó ningún reset ni modificación destructiva de Supabase.

## Archivos modificados

- `lib/security.js`
  - `RATE_LIMIT_SECRET` ahora es obligatorio e independiente.
  - Se eliminó el fallback que derivaba la clave HMAC desde `SUPABASE_SERVICE_ROLE_KEY`.
  - Si falta la variable, el rate limit falla de forma cerrada y el endpoint responde con error controlado.

- `api/mercadopago-webhook.js`
  - Se corrigió un bug real: se usaba `publicSiteOrigin()` sin importarlo.
  - Se agregó validación estricta del `paymentId` antes de consultar la API privada de Mercado Pago.
  - Se mantiene la consulta server-side del pago real, validación de firma, referencia, monto y moneda.

- `scripts/check-project.mjs`
  - Se agregó detección de secretos con patrón `sk-...`.
  - Se agregó verificación específica de que `.env.example` no contenga valores privados reales para variables sensibles.
  - Se conservan los checks existentes de JS, CSS, JSON, archivos requeridos, referencias locales y patrones de credenciales.

- `AUDITORIA-FINAL.md`
  - Este informe.

## Hallazgos confirmados

### Checkout y precios
- Los precios se recalculan en servidor usando Supabase; no se confía en el precio enviado por el navegador.
- El stock se valida server-side.
- Los descuentos de producto y cupones se calculan server-side.
- El total enviado a Mercado Pago se construye desde datos validados por servidor.

### Tracking
- `/api/order-status` exige `id` UUID válido + `tracking_token` UUID válido.
- No permite consultar un pedido solo con el ID.
- La respuesta pública no incluye dirección, teléfono ni email del cliente.

### Mercado Pago
- El webhook consulta el pago real mediante `MERCADOPAGO_ACCESS_TOKEN`.
- Se verifican referencia de pedido, monto y moneda.
- Se usa RPC server-side para confirmar el pago y evitar doble procesamiento de stock/cupón.
- Se contemplan `approved`, `pending`, `in_process`, `rejected`, `cancelled`, `refunded` y `charged_back`.
- La firma del webhook puede hacerse obligatoria con `MERCADOPAGO_REQUIRE_SIGNATURE=true`.

### Emails
- HTML dinámico escapado antes de insertarse en el email.
- Gmail App Password solo se toma de variable de entorno.
- Hay timeout de conexión/saludo/socket en Nodemailer.
- La prevención de duplicados usa RPC/registro en Supabase.
- Se corrigió el import faltante que podía romper emails disparados desde el webhook.

### Admin/Auth
- El panel usa Supabase Auth y verifica `admin_users`.
- La sesión se guarda en `sessionStorage`, no `localStorage`.
- Esto reduce persistencia entre sesiones, pero el refresh token sigue accesible a JavaScript si existiera XSS.
- Migrar a cookies HttpOnly requeriría cambiar la arquitectura de autenticación y proxy de Supabase; no se hizo para evitar sobreingeniería y riesgo de romper el panel actual.
- La CSP actual reduce de forma importante el riesgo de ejecución de scripts arbitrarios.

### Archivos y rendimiento
- `.env.example` existe y no contiene secretos privados.
- No se encontraron IDs HTML duplicados en las páginas principales.
- No se encontraron referencias heredadas de FER ELECTRO en los archivos revisados por el quality check.
- No se eliminaron PNGs que todavía tienen referencias SEO/Schema o compatibilidad.

## Supabase

No se creó una migración SQL nueva porque los cambios necesarios de esta auditoría están en código/configuración y las migraciones existentes ya contienen el hardening indicado en el ZIP.

No ejecutar ningún reset.

## Variables de entorno necesarias en Vercel

- `SUPABASE_URL`: URL HTTPS del proyecto Supabase.
- `SUPABASE_PUBLISHABLE_KEY`: clave pública/publishable del proyecto.
- `SUPABASE_SERVICE_ROLE_KEY`: service role privada, solo servidor.
- `PUBLIC_SITE_URL`: URL pública canónica del sitio, por ejemplo `https://dorado-art-pesca.vercel.app`.
- `RATE_LIMIT_SECRET`: secreto aleatorio independiente y largo para HMAC/rate limiting. OBLIGATORIO con esta versión.
- `MERCADOPAGO_ENABLED`: `true` o `false`.
- `MERCADOPAGO_ACCESS_TOKEN`: access token privado de Mercado Pago.
- `MERCADOPAGO_WEBHOOK_SECRET`: secreto de firma del webhook.
- `MERCADOPAGO_REQUIRE_SIGNATURE`: recomendado `true` en producción una vez verificada la firma.
- `GMAIL_USER`: cuenta Gmail remitente.
- `GMAIL_APP_PASSWORD`: contraseña de aplicación de Gmail.
- `EMAIL_REPLY_TO`: correo comercial para respuestas.

No colocar valores privados en el repositorio.

## Comprobaciones ejecutadas

- `node --check` sobre todos los `.js`/`.mjs` de `/api`, `/lib`, `/assets/js` y `/scripts`: OK.
- `npm run check`: OK.
- Archivos requeridos: OK.
- JSON (`package.json`, `manifest.webmanifest`, `vercel.json`): OK.
- CSS: llaves balanceadas.
- Referencias locales principales: OK.
- Escaneo de secretos: OK.
- `.env.example` sin secretos privados: OK.
- IDs HTML duplicados en páginas principales: ninguno.

### Limitación del entorno

Se intentó `npm install --ignore-scripts --no-audit --no-fund`, pero el entorno de ejecución no pudo completar la descarga antes del timeout. No se modificó `package.json` ni se generó un lockfile nuevo. `npm run check` sí pudo ejecutarse porque el script usa únicamente módulos nativos de Node.

Antes del deploy final, en tu PC ejecutá:

```bash
npm install
npm run check
```

## Comandos finales para GitHub

```bash
git status
git add .
git commit -m "Harden security and finalize Dorado ecommerce"
git push origin main
```

## Paso manual obligatorio antes de producción

En Vercel, confirmar que `RATE_LIMIT_SECRET` exista en Production (y en Preview si probás allí). Debe ser distinto de `SUPABASE_SERVICE_ROLE_KEY` y de cualquier token de Mercado Pago/Gmail.

Si activás `MERCADOPAGO_REQUIRE_SIGNATURE=true`, confirmar primero que `MERCADOPAGO_WEBHOOK_SECRET` corresponde al secreto real configurado para el webhook de Mercado Pago.
