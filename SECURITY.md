# Security Policy

## Principios del proyecto

Dorado separa credenciales públicas y privadas:

- las claves privadas viven únicamente en variables de entorno server-side;
- `SUPABASE_SERVICE_ROLE_KEY` no debe enviarse al navegador;
- los precios y stock sensibles se validan en backend;
- Supabase utiliza Row Level Security;
- las APIs sensibles aplican validaciones y rate limiting;
- Mercado Pago debe validar firma de webhook antes de habilitar producción.

## Secretos

Nunca versionar:

- archivos `.env` reales;
- service role de Supabase;
- access token de Mercado Pago;
- secret de webhook;
- Gmail App Password;
- secretos de rate limiting.

El archivo `.env.example` contiene únicamente nombres de variables.

## Reporte de vulnerabilidades

Si detectás una vulnerabilidad, evitá publicar credenciales o detalles explotables en un issue público.

Para un entorno comercial, el canal de contacto de seguridad debe reemplazarse por el email comercial definitivo cuando esté disponible.

## Alcance

Este repositorio se encuentra en preproducción. Las configuraciones de pagos y correo productivo se habilitarán únicamente después de completar el checklist comercial y técnico.
