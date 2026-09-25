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
