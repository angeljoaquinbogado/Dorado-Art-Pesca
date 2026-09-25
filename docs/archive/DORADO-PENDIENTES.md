# Dorado — datos pendientes del comercio

La web está en estado **casi final**. Ya no están pendientes la dirección, los horarios ni el responsable de atención.

## Confirmado

- Dirección: Las Heras 1680, Carupá, San Fernando, Buenos Aires.
- Horarios: lunes a viernes 09:00–13:00 y 16:00–20:00; sábado 09:00–20:00; domingo cerrado.
- Responsable de atención: Maximiliano Villarino.
- WhatsApp y redes sociales.

## Pendiente antes del lanzamiento completo

- Crear/confirmar email comercial.
- Crear el usuario Admin con ese email y agregarlo a `admin_users`.
- Confirmar cuenta y credenciales de Mercado Pago del comercio.
- Configurar webhook y firma de Mercado Pago.
- Confirmar transportistas, zonas, costos y tiempos de envío.
- Revisar con la tienda las políticas provisorias de cambios/devoluciones.
- Cargar productos, precios, stock e imágenes reales desde Admin.
- Probar una compra real de importe bajo antes de habilitar MP públicamente.

Mientras `MERCADOPAGO_ENABLED=false`, Mercado Pago queda deshabilitado en la web y los pedidos pueden coordinarse por WhatsApp, transferencia o efectivo con retiro.
