# 2026-09-27 — Admin polish + full-page directional motion

- Rediseñada la barra de filtros y acciones masivas de Pedidos en Admin.
- Selects, fechas, búsqueda, CSV, checkboxes y borrado comparten ahora el mismo lenguaje visual.
- Nuevo sistema de entrada por scroll en Admin con direcciones alternadas y ejecución única.
- Movimiento público ampliado a catálogo, productos, proceso, reseñas, FAQ, contacto y footer.
- Animaciones limitadas a `transform` + `opacity`, con `prefers-reduced-motion`.
- Sin dependencias nuevas ni cambios en lógica de pedidos, stock, checkout o pagos.

# Changelog

Los cambios relevantes del proyecto se documentan aquí. El historial completo sigue disponible en Git.

## 2026-09-27

### Fluid motion / Apple-inspired interaction pass

- Consolidado `assets/css/motion-craft.css`: se eliminaron dos sistemas de motion superpuestos y quedó una sola capa coherente.
- Feedback táctil inmediato desde `pointerdown` para CTAs y controles principales.
- Carrito y “Mis pedidos” ganan swipe-to-dismiss en touch con tracking 1:1, histéresis, rubber-banding, proyección de momentum y salida por velocidad/distancia.
- Drawers conservan trayectoria simétrica y transiciones reversibles desde el estado visual actual.
- Se quitaron delays artificiales de 50 ms antes de enfocar producto, carrito y checkout; ahora el foco se sincroniza con el siguiente frame.
- Se reforzó `prefers-reduced-motion`, `prefers-reduced-transparency` y `prefers-contrast`.
- Tipografía con optical sizing cuando el navegador/fuente lo soporta, sin sustituir la identidad tipográfica de DORADO.
- Motion restringido a `transform` y `opacity` en trayectorias; sin nuevas librerías ni blur animado.
- Versionado de `motion-craft.css` y `site.js` actualizado para evitar servir assets viejos desde caché.

## 2026-09-26

### Pagos, reseñas y continuidad visual

- Corregida la estructura HTML del bloque de checkout y el foco del diálogo de confirmación.
- Mercado Pago, MODO y tarjeta permanecen visibles en el selector aunque todavía estén por activar; al intentar usarlos se informa el estado real sin fingir un cobro.

- Selector compacto de forma de pago, equivalente al selector de entrega, con detalle contextual debajo.
- Transferencia preparada para mostrar alias, CBU/CVU, titular y banco desde variables públicas controladas.
- Confirmación previa antes de redirigir a Mercado Pago o MODO.
- Tarjeta preparada para integrar campos seguros/tokenizados sin almacenar PAN, vencimiento ni CVV en Dorado.

- Restaurados WhatsApp, transferencia y efectivo junto a Mercado Pago, MODO y débito/crédito; las opciones nuevas se suman sin reemplazar las existentes.
- FAQ ajustada para usar el mismo fondo de la sección, sin tarjetas blancas.
- Respuesta de seguimiento reescrita con un tono más natural y directo.

- Checkout rediseñado con Mercado Pago, MODO y tarjeta de débito/crédito como opciones finales.
- La opción tarjeta evita campos propios de PAN/CVV y deriva el ingreso sensible al procesador seguro.
- FAQ actualizada con los medios de pago finales.
- Sección de FAQ integrada a la misma paleta cálida de la zona de confianza, eliminando el corte blanco.
- Infraestructura `resenas_google` con RLS para almacenar únicamente reseñas reales sincronizadas.
- Carrusel horizontal automático de reseñas destacadas, con movimiento de derecha a izquierda.
- Las reseñas de menor calificación quedan fuera del carrusel y aparecen solo al abrir el filtro.
- Endpoint `/api/reviews` agregado para servir reseñas sanitizadas al storefront.

### Operación, seguimiento y storefront

- Seguimiento semiautomático de envíos con transportista, código, estado y enlace oficial.
- Actualización automática del seguimiento privado del cliente.
- Métricas del Admin: ingresos confirmados, ticket promedio y pedidos por despachar.
- Exportación CSV ampliada con datos logísticos.
- Productos relacionados por categoría y stock.
- Sección “Más elegidos” alimentada únicamente por compras pagadas reales.
- Sección de opiniones con acceso a la ficha real de Google Maps, sin testimonios inventados.
- FAQ visible y datos estructurados FAQPage para SEO.
- Migración idempotente `database/shipping-tracking.sql`.
- Ajustes responsive del panel Admin y controles adicionales en Quality Check.

## 2026-09-25

### Comercio y automatización

- Emails automáticos de pedido pendiente, pago aprobado y pago cancelado/rechazado.
- Ventana de 24 horas para completar o reintentar un pago pendiente.
- Descuentos porcentuales por producto administrables desde el panel.
- Cupones con porcentaje o monto fijo, compra mínima, vigencia, límite de usos y estado activo/inactivo.
- Validación server-side de precios, descuentos y cupones.
- Limpieza de documentación histórica sin uso operativo.


## 2026-09-24

### Portfolio / mantenimiento

- README orientado a portfolio.
- Documentación técnica reorganizada.
- Arquitectura y deploy documentados.
- Checklist de preproducción separado de la documentación histórica.
- Quality Check agregado mediante Node.js y GitHub Actions.
- Base de datos documentada.

### Storefront

- Fondo vertical exclusivo para mobile.
- Intro y hero móvil sincronizados con la misma imagen.
- Navegación inferior móvil refinada.
- Dirección, horarios y datos comerciales confirmados.
- Políticas provisorias y checkout de preproducción.

## 2026-09-23

- Optimización integral de responsive y UX.
- Ajustes de intro cinematográfica.
- Mejoras en catálogo, carrito, checkout y seguimiento.
- Revisión de seguridad y estructura.

## Historial anterior

El historial detallado permanece disponible en Git.
