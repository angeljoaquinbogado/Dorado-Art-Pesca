# Dorado — versión casi final (24/09/2026)

Esta versión parte del ZIP actual del repositorio del usuario y conserva los últimos cambios visuales y responsive.

## Integrado en esta pasada

- Dirección exacta del local: Las Heras 1680, Carupá, San Fernando, Buenos Aires.
- Horarios visibles en Contacto y en datos estructurados SEO.
- Estado dinámico “Abierto ahora / Cerrado ahora” usando la zona horaria de Buenos Aires.
- Responsable de atención: Maximiliano Villarino.
- Mapa ajustado a la dirección exacta.
- Footer y datos de ubicación actualizados.
- Textos de envíos cambiados a “a coordinar” para no prometer transportistas/costos todavía no confirmados.
- Mercado Pago visible como próximo a habilitar, bloqueado por defecto en frontend y backend.
- Activación futura de MP mediante `MERCADOPAGO_ENABLED=true`.
- Checkout usable mientras tanto por WhatsApp, transferencia o efectivo con retiro.
- Políticas provisorias ampliadas para compra, stock, retiro, entregas, cambios, devoluciones y privacidad.
- `.env.example` seguro sin credenciales.
- Documentación de pendientes actualizada.
- Hash CSP recalculado por el cambio de datos estructurados.

## Todavía pendiente por decisión comercial

- Email comercial y usuario Admin definitivo.
- Credenciales de Mercado Pago de producción y webhook.
- Transportistas, costos y tiempos de envío.
- Revisión final de las políticas por el comercio.
- Productos, precios y stock reales cargados desde Admin.

## Verificaciones realizadas

- Sintaxis JavaScript validada con Node.
- HTML parseado sin IDs duplicados.
- JSON válido en `package.json`, `manifest.webmanifest` y `vercel.json`.
- CSS con llaves balanceadas.
- Referencias locales de HTML comprobadas sin archivos faltantes.
- Hash CSP del JSON-LD recalculado y verificado.
