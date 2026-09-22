# Hardening de seguridad — 18/09/2026

Este parche refuerza la versión actual de Dorado Artículos de Pesca sin cambiar Mercado Pago a Producción.

## Incluye

- rate limit server-side para checkout, seguimiento, búsqueda de direcciones y webhook;
- claves de rate limit con HMAC (no se almacena la IP en texto plano);
- bloqueo de degradación de estados de pago;
- confirmación de pago reforzada para evitar reprocesar estados terminales;
- soporte para validar la firma criptográfica del webhook de Mercado Pago;
- CSP más estricta: JavaScript inline deshabilitado;
- eliminación de `onclick` inline del frontend;
- `nodemailer` fijado a una versión exacta;
- headers extra de aislamiento;
- `admin.html` y `pedido.html` con `Cache-Control: no-store`.

## Antes de subir el parche

Ejecutar:

`database/security-hardening.sql`

## Firma de Mercado Pago

El código queda preparado para:

- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_REQUIRE_SIGNATURE`

Durante TEST, `MERCADOPAGO_REQUIRE_SIGNATURE=false` evita romper el webhook si todavía no cargaste el secreto.

Antes de Producción:
1. cargar el secreto real del webhook;
2. probar una compra;
3. confirmar que el webhook responde 200;
4. recién ahí usar `MERCADOPAGO_REQUIRE_SIGNATURE=true`.

## MFA del Admin

Este parche NO fuerza MFA todavía para evitar bloquear el panel sin un flujo de enrolamiento probado.
Antes del lanzamiento real conviene habilitar MFA/TOTP de Supabase para el usuario administrador y luego exigir AAL2 en las políticas de administración.

## CSP JSON-LD

Hash actual permitido:

`'sha256-nr7JxLEXkPAWw4cWxZ+DM0FnNdknor227b2gg0GxK+w='`
