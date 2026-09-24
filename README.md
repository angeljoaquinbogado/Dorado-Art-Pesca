# Dorado Artículos de Pesca

Tienda online de Dorado Artículos de Pesca. Esta versión queda en estado **casi final** para revisión del comercio.

## Ya confirmado

- Dirección: Las Heras 1680, Carupá, San Fernando, Buenos Aires.
- Horarios: lunes a viernes 09:00–13:00 y 16:00–20:00; sábado 09:00–20:00; domingo cerrado.
- WhatsApp: +54 9 11 6807-0039.
- Instagram, Facebook y TikTok del negocio.
- Responsable de atención: Maximiliano Villarino.
- Diseño responsive para desktop, notebook, tablet y celular.
- Imagen de hero específica para móvil y versión horizontal para escritorio.
- Catálogo dinámico, buscador, filtros y ficha de producto.
- Carrito, checkout, Mis pedidos y seguimiento.
- Panel Admin para productos, stock, imágenes y pedidos.
- Políticas provisorias de compra, cambios, devoluciones y privacidad.

## Pendiente antes de producción completa

1. Crear/confirmar el email comercial.
2. Crear el usuario Admin con ese email y agregarlo a `admin_users`.
3. Confirmar Mercado Pago del comercio y activar `MERCADOPAGO_ENABLED=true` en Vercel.
4. Configurar token y webhook reales de Mercado Pago.
5. Confirmar empresas de transporte, zonas, costos y tiempos de envío.
6. Revisar con el comercio el texto definitivo de cambios/devoluciones.
7. Cargar productos, precios y stock reales desde el panel Admin.
8. Hacer una compra real de importe bajo y verificar el circuito completo antes del lanzamiento.

## Mercado Pago

La interfaz lo muestra como **próximo a habilitar** mientras `MERCADOPAGO_ENABLED` no sea `true`. El endpoint de checkout también rechaza pagos MP mientras esa variable no esté activa, evitando compras accidentales antes de terminar la configuración.

## Seguridad

Las claves privadas deben existir únicamente en Vercel. Nunca subir `.env`, `SUPABASE_SERVICE_ROLE_KEY`, `MERCADOPAGO_ACCESS_TOKEN`, contraseñas de aplicación ni secretos de webhook al repositorio.

Ver `docs/DATOS-PENDIENTES-PARA-TIA.md` para la lista corta de información que falta confirmar.
