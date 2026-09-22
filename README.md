# Dorado Artículos de Pesca

Tienda online independiente basada en la arquitectura reutilizable del proyecto FER ELECTRO, con identidad, repositorio, Supabase y credenciales propios.

## Incluye

- Intro cinematográfica inspirada en el video de referencia.
- Hero de pesca al atardecer con animación suave.
- Catálogo dinámico, buscador y filtros por categoría.
- Carrito, checkout y seguimiento de pedidos.
- Mercado Pago / tarjetas preparado para configurar.
- Transferencia, efectivo en retiro y coordinación por WhatsApp.
- Panel Admin para productos, stock, galerías y pedidos.
- Carga de imágenes fuente de hasta 50 MB con optimización automática a WebP antes de Storage.
- Galerías con múltiples imágenes por producto.
- Responsive, SEO, PWA y medidas de seguridad heredadas del proyecto base.

## Antes de producción

1. Crear un proyecto NUEVO de Supabase para Dorado.
2. Ejecutar los SQL de `database/` según `docs/README-PRODUCCION.md`.
3. Crear el usuario Admin y agregarlo a `admin_users`.
4. Configurar variables de entorno en Vercel.
5. Configurar Mercado Pago del comercio y su webhook.
6. Confirmar email comercial y medio/logística de envíos.
7. Hacer una compra real de importe bajo y verificar todo el circuito.

Nunca reutilizar claves privadas, usuarios ni datos de clientes de otra tienda.
