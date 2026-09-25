# Checklist de preproducción

## Configuración comercial

- [ ] Crear email comercial.
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

## Email

- [ ] Configurar remitente.
- [ ] Configurar reply-to.
- [ ] Probar confirmación de pedido.
- [ ] Verificar que un webhook repetido no duplique emails.

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
