# Checklist de preproducción

## Configuración comercial

- [ ] Crear email comercial.
- [ ] Crear usuario Admin definitivo.
- [ ] Agregar el usuario autorizado a `admin_users`.
- [ ] Confirmar transportistas, zonas, costos y tiempos.
- [ ] Probar en un pedido real el código y enlace oficial de seguimiento del transportista.
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

## Datos de transferencia

- [ ] Confirmar alias real del negocio (`BANK_TRANSFER_ALIAS`).
- [ ] Confirmar CBU/CVU real (`BANK_TRANSFER_CBU`).
- [ ] Confirmar titular de la cuenta (`BANK_TRANSFER_HOLDER`).
- [ ] Confirmar banco o nombre de cuenta (`BANK_TRANSFER_BANK`).
- [ ] No publicar datos inventados.

## MODO y tarjetas

- [ ] Confirmar alta comercial de MODO.
- [ ] Obtener la documentación y credenciales productivas de MODO.
- [ ] Implementar el endpoint productivo de MODO y probar pago aprobado/rechazado.
- [ ] Para tarjeta, utilizar campos/tokenización del procesador; no enviar PAN, vencimiento ni CVV a servidores de Dorado.
- [ ] Probar débito y crédito con una compra controlada.

## Reseñas

- [ ] Conectar la fuente real de Google Business Profile.
- [ ] Sincronizar autor, calificación, comentario y fecha en `resenas_google`.
- [ ] Confirmar que el carrusel principal muestre solo reseñas de 4–5 estrellas.
- [ ] Confirmar que las reseñas de 1–3 estrellas aparezcan únicamente al abrir el filtro.
- [ ] No cargar reseñas ficticias.

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
- [ ] Seguimiento privado.
- [ ] Seguimiento de transportista: transportista, código, URL oficial y actualización de estado.
- [ ] Admin.
- [ ] WhatsApp y redes.
- [ ] Google Maps.
- [ ] Consola sin errores.
- [ ] Compra real de importe bajo end-to-end.
