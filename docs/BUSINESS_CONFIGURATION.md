# Configuración comercial

Este documento separa la configuración técnica de las decisiones que dependen del comercio.

## Confirmado

- Negocio: Dorado Artículos de Pesca.
- Dirección: Las Heras 1680, Carupá, San Fernando, Buenos Aires.
- Horarios:
  - lunes a viernes: 09:00–13:00 y 16:00–20:00;
  - sábado: 09:00–20:00;
  - domingo: cerrado.
- WhatsApp: +54 9 11 6807-0039.
- Responsable de atención: Maximiliano Villarino.
- Redes sociales del negocio integradas en el storefront.

## Pendiente

### Email comercial

Crear un correo exclusivo para Dorado. Se utilizará para:

- usuario Admin;
- confirmaciones de pedidos;
- contacto comercial;
- reply-to de emails automáticos.

### Mercado Pago

Antes de activar pagos:

- confirmar la cuenta del comercio;
- cargar credenciales productivas;
- configurar webhook;
- configurar firma del webhook;
- cambiar `MERCADOPAGO_ENABLED=true`;
- realizar una compra real de importe bajo.

### Envíos

Definir:

- transportistas;
- zonas cubiertas;
- entrega local;
- costos;
- tiempos estimados;
- quién asume el envío en cambios voluntarios.

### Catálogo

Cargar desde Admin:

- nombre;
- categoría;
- descripción;
- características;
- precio;
- stock;
- imágenes;
- visibilidad.

## Políticas

La web incluye un texto provisorio. Debe ser revisado por el comercio antes de habilitar la operación completa.

## 3 cuotas sin interés (Mercado Pago)

- `payment_methods.installments: 3` solamente limita a un máximo de 3 cuotas en Checkout Pro; no configura tasas de financiación.
- El comerciante debe habilitar la financiación sin interés específicamente para **Checkout online**, en su cuenta de Mercado Pago. Las promociones de QR y Tap no acreditan que Checkout las tenga activas.
- La simulación del administrador es una estimación de comisiones, no prueba de que el comprador pague 0% de interés.
- No utilizar el entorno **Test** como única prueba de financiación real. Confirmar las condiciones con la cuenta titular, tarjetas y promociones elegibles antes de comunicar la oferta.
- En Vercel, `MERCADOPAGO_3_CUOTAS_VERIFICADAS=false` (valor por defecto) mantiene la opción de administración guardada, pero el catálogo utiliza precios ordinarios y no promete cuotas sin interés.
- Configurar `MERCADOPAGO_3_CUOTAS_VERIFICADAS=true` solamente cuando se haya validado que Checkout realmente ofrece 3x del mismo total (sin intereses) con una tarjeta elegible; desplegar de nuevo y comprobar en producción.
- Si la promoción deja de estar disponible, volver a `false` para evitar promesas o cargos engañosos. La validación se hace del lado del servidor.
