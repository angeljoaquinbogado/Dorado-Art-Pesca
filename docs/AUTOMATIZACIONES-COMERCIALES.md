# Automatizaciones comerciales

Esta versión agrega únicamente funciones comerciales relacionadas con descuentos, cupones y avisos de compra/pago.

## 1. Actualizar Supabase

Para una base de Dorado que ya existe, ejecutar en **Supabase > SQL Editor**:

```text
database/commerce-features.sql
```

El script agrega:

- descuento porcentual por producto;
- tabla de cupones y permisos del Admin;
- subtotal, descuento y cupón en pedidos;
- enlace de reintento y vencimiento de pago;
- control anti-duplicado de emails por estado;
- registro del uso de cupón cuando el pago queda aprobado.

## 2. Configurar el email en Vercel

Variables de entorno:

```text
GMAIL_USER=doradoartpesca@gmail.com
GMAIL_APP_PASSWORD=<contraseña de aplicación de Google>
EMAIL_REPLY_TO=doradoartpesca@gmail.com
```

`GMAIL_APP_PASSWORD` debe ser una contraseña de aplicación de Google; no se debe guardar la contraseña normal del correo en el repositorio.

## 3. Emails automáticos

- **Pendiente:** se envía al crear el pago y contiene un enlace para reintentar dentro de las próximas 24 horas.
- **Aprobado:** se envía el comprobante con pedido, productos, total, descuento/cupón si corresponde y seguimiento.
- **Cancelado o rechazado:** se informa que el pago no se completó y se ofrece reintento mientras el enlace siga vigente.
- **Reembolso/contracargo:** se informa el cambio de estado.

Los webhooks repetidos no generan correos duplicados porque cada tipo de notificación se reclama de forma atómica en Supabase.

## 4. Descuentos y cupones

En `admin.html`:

- cada producto admite un descuento porcentual de 0% a 90%;
- existe una nueva sección **Cupones**;
- los cupones pueden ser por porcentaje o monto fijo;
- admiten compra mínima, fecha desde/hasta, límite de usos y activo/inactivo.

El precio real, el descuento y el cupón se vuelven a validar en el servidor antes de crear el pago. El navegador no decide el importe final.

## 5. Orden recomendado para publicar

1. Ejecutar `database/commerce-features.sql` en Supabase.
2. Cargar las tres variables de email en Vercel.
3. Desplegar esta versión.
4. Hacer una compra de prueba con Mercado Pago.
5. Verificar: email pendiente, aprobación, comprobante, seguimiento y panel Admin.
