# TEST CHECKLIST — DORADO ARTÍCULOS DE PESCA

## Ejecutado automáticamente / estáticamente

- [x] Archivos requeridos presentes.
- [x] `package.json` válido.
- [x] `manifest.webmanifest` válido.
- [x] `vercel.json` válido.
- [x] Sintaxis de JavaScript válida en APIs, libs y frontend.
- [x] Llaves CSS balanceadas.
- [x] Referencias locales principales sin archivos faltantes.
- [x] Sin `.env` reales dentro del proyecto.
- [x] Sin patrones básicos de secretos privados conocidos.
- [x] `.env.example` sin secretos sensibles cargados.
- [x] Sin referencias heredadas a FER ELECTRO.
- [x] `npm run check` después de los cambios.
- [x] `npm audit --offline --omit=dev` sin vulnerabilidades reportadas por metadata local.
- [x] Reseñas ya no generan el bloque visual `G`.
- [x] Marquee de reseñas mantiene `linear`.
- [x] `prefers-reduced-motion` existe para reseñas.
- [x] Autocompletado aborta requests antiguos.
- [x] Autocompletado cachea búsquedas repetidas.
- [x] Rate-limit Supabase tiene timeout.
- [x] Checkout valida método de pago online permitido.
- [x] CSP permite ambos bloques JSON-LD actuales.
- [x] `motion-craft.css` consolidado en un único sistema V3, sin la capa V1/V2 duplicada.
- [x] Swipe de drawers usa Pointer Events, captura de puntero, histéresis y cálculo de velocidad.
- [x] Drag de drawers sólo actualiza `transform` + opacidad del overlay.
- [x] `prefers-reduced-motion` desactiva el gesto físico y los desplazamientos no esenciales.
- [x] Query strings de CSS/JS actualizadas para invalidar caché estática.

## Revisado en código

- [x] Carrito: agregar/eliminar/cantidad/persistencia implementados.
- [x] Checkout: campos de contacto, entrega, cupones y métodos de pago implementados.
- [x] Efectivo restringido a retiro local.
- [x] Transferencia muestra datos públicos y copiar.
- [x] WhatsApp genera resumen del pedido.
- [x] Tarjeta/Mercado Pago dependen del flag real de configuración.
- [x] MODO no se presenta como operativo cuando está deshabilitado.
- [x] Seguimiento usa ID + tracking token.
- [x] Webhook vuelve a consultar Mercado Pago.
- [x] Webhook compara monto/moneda.
- [x] SQL posee descuento atómico de stock con bloqueo de filas.
- [x] Admin posee control de sesión/permisos Supabase.
- [x] Galería de productos y carga múltiple existen en admin.
- [x] Reseñas se ocultan si API no devuelve opiniones.
- [x] SEO: canonical, OpenGraph, Twitter y JSON-LD presentes.
- [x] PWA: manifest presente.
- [x] 404, robots y sitemap presentes.

## Debe comprobarse después del deploy real

- [ ] Abrir `/` en 320, 360, 375, 390, 430, 768, 820, 1024, 1280, 1366, 1440 y 1920 px.
- [ ] Confirmar que no hay texto superpuesto en hero, tarjetas, checkout y footer.
- [ ] Confirmar que el select nativo no aparece junto al personalizado.
- [ ] Agregar producto, cambiar cantidad, borrar producto y vaciar carrito.
- [ ] Aplicar cupón válido e inválido.
- [ ] Probar búsqueda y filtros.
- [ ] Abrir galería de producto y cambiar imagen.
- [ ] Probar autocompletado con dirección real, teclado y touch.
- [ ] Probar transferencia y botón copiar.
- [ ] Probar flujo WhatsApp.
- [ ] Probar efectivo + retiro.
- [ ] Confirmar que efectivo + envío queda bloqueado.
- [ ] Probar Mercado Pago sandbox/producción según credenciales.
- [ ] Confirmar webhook firmado si `MERCADOPAGO_REQUIRE_SIGNATURE=true`.
- [ ] Confirmar descuento de stock una sola vez ante webhooks repetidos.
- [ ] Confirmar email de pedido pendiente/aprobado/cancelado.
- [ ] Abrir `/pedido.html` con token real y validar seguimiento.
- [ ] Iniciar sesión en `/admin.html` con usuario admin real.
- [ ] Crear/editar producto y subir varias imágenes.
- [ ] Cambiar estado de preparación y tracking.
- [ ] Eliminar únicamente pedidos de prueba desde admin.
- [ ] Revisar consola del navegador sin errores.
- [ ] Ejecutar Lighthouse móvil y desktop.
- [ ] Medir Performance panel durante scroll y animaciones.
- [ ] En iPhone/Android: abrir carrito, arrastrar el encabezado a la derecha y confirmar tracking 1:1.
- [ ] Soltar el drawer antes del umbral y confirmar que vuelve suavemente a su lugar.
- [ ] Hacer un flick rápido a la derecha y confirmar cierre por velocidad/momentum.
- [ ] Arrastrar levemente hacia la izquierda y confirmar resistencia suave, sin desplazamiento libre.
- [ ] Repetir los cuatro casos anteriores en “Mis pedidos”.
- [ ] Activar `prefers-reduced-motion` y confirmar que el swipe físico queda desactivado sin perder funcionalidad de cierre.
- [ ] Revisar memoria tras 5–10 minutos de navegación/admin.

## Criterio de salida

No considerar el sitio completamente validado en producción hasta completar la sección posterior al deploy, porque requiere servicios externos y un navegador real.
