# Galería de imágenes por producto

Implementado:
- múltiples imágenes por producto;
- la primera imagen funciona como principal;
- el Admin permite subir varias a la vez;
- se puede cambiar la principal, mover izquierda/derecha y quitar;
- se puede agregar una imagen por URL;
- la ficha del producto muestra miniaturas y flechas;
- funciona en escritorio y móvil;
- se mantiene `productos.imagen` por compatibilidad y se agrega `productos.imagenes`.

Antes de usar:
1. Ejecutar `database/product-gallery.sql` en Supabase.
2. Confirmar que el bucket `productos` ya existe (hecho previamente).
3. Subir este parche y redeployar Vercel.
