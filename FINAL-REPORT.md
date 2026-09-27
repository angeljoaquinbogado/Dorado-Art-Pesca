# FINAL REPORT — DORADO ARTÍCULOS DE PESCA

Fecha de auditoría: 2026-09-27

## Alcance real

Se auditó el proyecto entregado completo (109 archivos): HTML, CSS, JavaScript, APIs Vercel, librerías backend, configuración Vercel, PWA, manifest, robots, sitemap, SQL/migrations, admin, checkout, seguimiento, reseñas y documentación.

No se recibieron en este turno `impeccable-main.zip`, `taste-skill-main.zip` ni `skills-main.zip`, por lo que no se utilizaron ni se simuló haberlos revisado.

No se modificaron datos reales de Supabase ni se ejecutaron escrituras sobre una base de producción. No se usaron credenciales privadas.

## Cambios implementados

### 1. Reseñas

- Se eliminó del HTML generado de cada reseña la marca visual `G` que aún seguía creándose en `assets/js/site.js`.
- La fila animada conserva sólo una selección razonable de reseñas destacadas y duplica únicamente ese subconjunto para el loop continuo.
- Se conserva `linear` para el marquee y el modo `prefers-reduced-motion` existente.
- Se conserva el enlace `Ver en Google` y el listado filtrable completo.

### 2. Autocompletado de direcciones

- Se mantuvo el `AbortController` existente para cancelar solicitudes antiguas.
- Se agregó caché en memoria de hasta 30 búsquedas por combinación `dirección + provincia`.
- Las búsquedas repetidas reutilizan resultados sin volver a golpear `/api/address-search`.
- Se conservan teclado, selección móvil por `pointerdown`, cierre al tocar fuera y fallback manual.

### 3. Seguridad / estabilidad backend

- `consumeRateLimit()` ahora utiliza `fetchWithTimeout(..., 5000)` en vez de un `fetch()` sin timeout.
- Si Supabase no responde, el endpoint ya no puede quedar esperando indefinidamente por el RPC de rate-limit.
- `/api/checkout` valida explícitamente que el método de pago online recibido sea `mercadopago` o `tarjeta`.
- Los métodos manuales (WhatsApp, transferencia y efectivo) siguen resolviéndose en frontend y no pasan por el endpoint online.

### 4. CSP / SEO estructurado

- `index.html` contiene dos bloques JSON-LD inline.
- La Content-Security-Policy autorizaba sólo el hash del primero.
- Se calculó y agregó el hash SHA-256 del segundo bloque a `vercel.json`.
- Resultado: se mantiene una CSP restrictiva sin bloquear el segundo bloque de datos estructurados.

## Hallazgos importantes ya bien resueltos en el proyecto

- El checkout recalcula precios desde servidor y no confía en precios enviados por cliente.
- El webhook de Mercado Pago vuelve a consultar el pago directamente a Mercado Pago antes de confirmar el pedido.
- El webhook compara monto y moneda esperados.
- La confirmación de pago usa una función SQL con bloqueo de filas de productos y descuento atómico de stock.
- Hay validación UUID en seguimiento y operaciones administrativas sensibles.
- Hay rate-limit centralizado con clave HMAC y RPC en Supabase.
- El `service role`, token de Mercado Pago y contraseña Gmail no están en frontend.
- `.env.example` no contiene secretos privados reales.
- El admin usa sesión Supabase y comprobación de usuario admin.
- Los datos de tarjeta no se almacenan en Dorado.
- Los assets principales del hero usan WebP y existen preloads diferenciados para desktop/mobile.
- El sitio ya posee cache-control separado para assets, HTML, catálogo, reviews y configuración pública.

## Performance

### Mejoras verificables

- Hero desktop/mobile usa imágenes WebP optimizadas en la carga real.
- Existe `performance-v3.css`, que desactiva capas hero duplicadas, evita `backdrop-filter` en zonas críticas y limita `will-change`.
- Reseñas usan un subconjunto pequeño para el marquee en vez de renderizar todas las opiniones en el loop.
- El autocompletado ahora evita requests repetidos mediante caché en memoria.
- El rate-limit backend ya no puede bloquear indefinidamente la respuesta por falta de timeout.

### Riesgo técnico restante

La hoja de estilos conserva mucha deuda histórica: múltiples capas CSS de correcciones y una cantidad muy alta de `!important`. Se detectaron, aproximadamente:

- `site.css`: 206 KB / 4.784 líneas / ~1.902 `!important`
- `dorado-theme.css`: 113 KB / 3.141 líneas / ~1.852 `!important`
- `mobile.css`: 41 KB / 1.438 líneas / ~834 `!important`
- `final-responsive-fixes.css`: 26 KB / 892 líneas / ~633 `!important`

No se hizo una consolidación agresiva de esas hojas porque el requisito principal era no romper funciones ni responsive ya operativo. Unificar miles de reglas sin pruebas visuales reales en navegador y en todos los breakpoints tendría más riesgo que beneficio en esta entrega.

No se afirma “60 FPS garantizados”. No se ejecutó un benchmark real con Chrome DevTools/Lighthouse en hardware del cliente.

## Seguridad

### Validado estáticamente

- Sin `.env`, `.env.local` ni `.env.production` dentro del proyecto.
- Sin patrones conocidos de tokens privados detectados por el script de calidad.
- CSP con `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, bloqueo de `script-src-attr`, HSTS y otras cabeceras.
- Checkout y webhook usan `Cache-Control: no-store`.
- Inputs críticos del backend tienen límites de longitud/cantidad.
- El webhook no confía en el cuerpo para decidir si un pago fue aprobado.
- Stock y estado de pago están protegidos en funciones SQL/RPC.

### Riesgos que requieren entorno real

- La seguridad final depende de que las migrations SQL correctas estén realmente aplicadas en Supabase.
- Debe existir `RATE_LIMIT_SECRET` en Vercel; si falta, los endpoints protegidos fallan cerrado.
- Se recomienda activar `MERCADOPAGO_REQUIRE_SIGNATURE=true` sólo después de configurar correctamente `MERCADOPAGO_WEBHOOK_SECRET` y verificar el flujo real.
- No se realizó pentest remoto ni prueba de carga.
- No se ejecutó auditoría de políticas RLS contra una base conectada en producción; sólo se revisaron los SQL incluidos.

## Pagos

- WhatsApp, transferencia y efectivo se mantienen como flujos coordinados manualmente.
- Efectivo sigue restringido a retiro local.
- Tarjeta y Mercado Pago dependen de `MERCADOPAGO_ENABLED` y credenciales reales.
- MODO permanece deshabilitado si `MODO_ENABLED` no está activo y no se inventó una integración inexistente.
- No se guardan PAN/CVV.

## Supabase / base de datos

No fue necesario crear una migration nueva para los cambios de esta entrega.

El proyecto ya incluye funciones y hardening para:

- `confirmar_pago_pedido`
- `registrar_estado_pago`
- `admin_delete_orders`
- rate limiting
- tracking
- cupones
- reseñas
- galerías
- RLS/admin

No se borraron productos, pedidos ni datos reales.

## Pruebas ejecutadas

1. `npm run check` antes de modificar: PASS.
2. `npm run check` después de modificar: PASS.
3. `node --check assets/js/site.js`: PASS.
4. `node --check api/checkout.js`: PASS.
5. `node --check lib/security.js`: PASS.
6. Validación JSON de `package.json`, `manifest.webmanifest` y `vercel.json`: PASS por script del proyecto.
7. Balance de llaves CSS: PASS por script del proyecto.
8. Referencias locales principales: PASS por script del proyecto.
9. Escaneo básico de secretos: PASS por script del proyecto.
10. `npm audit --offline --omit=dev`: 0 vulnerabilidades reportadas con la metadata local disponible.
11. Verificación de que la marca `review-source` ya no se genera en JS: PASS.
12. Verificación de presencia de caché de dirección, validación de pago y segundo hash CSP: PASS.

## Lo que NO se declaró como probado

- No se abrió el deploy de Vercel desde este entorno.
- No se conectó a una Supabase real.
- No se hizo un pago real o sandbox real de Mercado Pago.
- No se enviaron emails reales.
- No se probaron físicamente iPhone/Android.
- No se midieron FPS/Lighthouse en navegador real.
- No se realizó load test.

## Archivos modificados en esta entrega

- `assets/js/site.js`
- `lib/security.js`
- `api/checkout.js`
- `vercel.json`
- `FINAL-REPORT.md`
- `TEST-CHECKLIST.md`
- `DEPLOY.md`

## Resultado

El proyecto queda con las funciones existentes conservadas, los cuatro problemas concretos anteriores corregidos y la validación local disponible en verde. Se evitó una reescritura masiva del CSS o arquitectura porque, sin pruebas visuales reales automatizadas del sitio desplegado, eso violaría la prioridad de no romper funciones ya operativas.
