# Checklist de preproducción

## Configuración comercial

- [x] Definir email comercial: `doradoartpesca@gmail.com`.
- [ ] Crear usuario Admin definitivo.
- [ ] Agregar el usuario autorizado a `admin_users`.
- [ ] Confirmar transportistas, zonas, costos y tiempos.
- [ ] Revisar políticas comerciales definitivas.

## Catálogo

- [ ] Cargar productos reales.
- [ ] Verificar precios.
- [ ] Verificar stock.
- [ ] Cargar imágenes optimizadas.
- [ ] Revisar categorías.
- [ ] Probar descuento de producto.
- [ ] Crear y probar al menos un cupón de porcentaje y uno de monto fijo.
- [ ] Confirmar que no quede visible ningún producto de muestra.

## Mercado Pago

- [ ] Confirmar cuenta productiva.
- [ ] Cargar access token en Vercel.
- [ ] Configurar webhook.
- [ ] Configurar secret de firma.
- [ ] Activar validación de firma.
- [ ] Establecer `MERCADOPAGO_ENABLED=true`.
- [ ] Probar pago aprobado.
- [ ] Probar pago rechazado o cancelado.
- [ ] Confirmar que el stock se descuente una sola vez.
- [ ] Probar reintento de pago desde el seguimiento antes de 24 horas.
- [ ] Confirmar que el reintento quede bloqueado al vencer las 24 horas.

## Email

- [x] Definir remitente y reply-to: `doradoartpesca@gmail.com`.
- [ ] Crear contraseña de aplicación de Google y cargar `GMAIL_APP_PASSWORD` en Vercel.
- [ ] Cargar `GMAIL_USER=doradoartpesca@gmail.com` y `EMAIL_REPLY_TO=doradoartpesca@gmail.com` en Vercel.
- [ ] Probar email de compra confirmada.
- [ ] Probar email de pago pendiente con vencimiento a 24 horas.
- [ ] Probar email de pago rechazado/cancelado.
- [ ] Verificar que un webhook repetido no duplique emails por evento.

## QA

- [ ] Desktop.
- [ ] Notebook.
- [ ] Tablet.
- [ ] iPhone.
- [ ] Android.
- [ ] Catálogo y búsqueda.
- [ ] Ficha de producto.
- [ ] Carrito.
- [ ] Checkout.
- [ ] Seguimiento.
- [ ] Admin.
- [ ] WhatsApp y redes.
- [ ] Google Maps.
- [ ] Consola sin errores.
- [ ] Compra real de importe bajo end-to-end.
