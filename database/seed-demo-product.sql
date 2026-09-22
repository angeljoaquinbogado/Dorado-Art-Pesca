-- Producto de referencia OPCIONAL. Queda oculto para no publicar inventario ficticio.
insert into public.productos (nombre, descripcion, caracteristicas, precio, stock, activo, categoria, imagen, imagenes)
values (
  'Producto de muestra — reemplazar desde Admin',
  'Registro de ejemplo para comprobar el catálogo. Reemplazar por un producto real antes de publicar.',
  'Cargá descripción, precio, stock e imágenes reales desde el panel Admin.',
  1, 0, false, 'Accesorios',
  '/assets/images/brand/logo-dorado.webp',
  array['/assets/images/brand/logo-dorado.webp']::text[]
);
