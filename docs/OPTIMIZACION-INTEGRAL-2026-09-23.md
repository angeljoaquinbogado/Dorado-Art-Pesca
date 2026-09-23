# Optimización integral — 23/09/2026

Esta revisión trabaja sobre la estructura real del proyecto Dorado y no inventa datos comerciales faltantes.

## Storefront

- Header negro consistente en estado inicial y al hacer scroll.
- Intro estabilizada: título en una línea, barrido del logo y textos auxiliares sincronizados.
- Hero y beneficios comparten una sola escena de fondo; las tarjetas mantienen efecto vidrio.
- Sección “La tienda” escalada para desktop, notebook, tablet y móvil.
- Catálogo oscuro responsive con búsqueda, botón de limpieza, filtros, contador y estado sin resultados.
- Tarjetas y detalle de producto adaptados por tamaño de pantalla.
- Galería con navegación por flechas, teclado y swipe.
- Carrito, checkout y “Mis pedidos” revisados para desktop y móvil.
- Flujo “Cómo comprar”, contacto, mapa, redes y footer unificados con la identidad Dorado.
- Botón de WhatsApp y navegación móvil consideran áreas seguras del dispositivo.

## UX y accesibilidad

- Foco visible para navegación con teclado.
- Diálogos con roles y atributos ARIA.
- Retorno de foco y trampa de foco en overlays principales.
- Feedback táctil equivalente a hover en tarjetas interactivas.
- Respeto de `prefers-reduced-motion`.
- Año del footer automático.
- Contador de carrito protegido para valores grandes.

## Rendimiento

- Imágenes dinámicas con `decoding=async` y lazy loading cuando corresponde.
- Hero WebP reutilizado como única escena para evitar descargas/repeticiones visuales innecesarias.
- Timeouts en llamadas server-side críticas a Supabase y Mercado Pago.
- Assets estáticos con caché desde Vercel.

## Seguridad

- Validación server-side de IDs, cantidades, stock y precios.
- Rate limits en operaciones sensibles.
- Service role reservada a endpoints server-side.
- CSP, HSTS, `nosniff`, política de referrer y restricciones de permisos.
- Webhook preparado para validar firma cuando se configure su secret real.

## Admin y seguimiento

- Panel Admin adaptado a la identidad Dorado y a diferentes tamaños de pantalla.
- Gestión de catálogo, stock, galería y pedidos conservada.
- Seguimiento de pedidos y páginas informativas con responsive final.

## No se completó con datos inventados

Los valores que dependan de información comercial definitiva o credenciales reales deben completarse con los datos confirmados por el negocio antes de producción.
