# DEPLOY — DORADO ARTÍCULOS DE PESCA

Entorno previsto: Windows 10/11 + PowerShell + VS Code.

Repositorio:

`https://github.com/angeljoaquinbogado/Dorado-Art-Pesca.git`

Branch:

`main`

## 1. Reemplazar el proyecto

Descomprimí `DORADO-ART-PESCA-APPLE-FLUID.zip`.

Copiá **el contenido interno de la carpeta `DORADO-ART-PESCA-APPLE-FLUID`** dentro de tu carpeta Git local, por ejemplo:

`C:\Users\joaqu\Downloads\Dorado-Art-Pesca-GIT`

No copies ningún `.env` real al repositorio.

## 2. Abrir PowerShell en el repositorio

```powershell
cd "C:\Users\joaqu\Downloads\Dorado-Art-Pesca-GIT"
```

## 3. Revisar antes de instalar o commitear

```powershell
git status
git remote -v
git branch --show-current
```

El remote esperado debe apuntar a:

`https://github.com/angeljoaquinbogado/Dorado-Art-Pesca.git`

La rama esperada debe ser:

`main`

## 4. Instalar dependencias de forma reproducible

```powershell
npm.cmd ci
```

## 5. Ejecutar la validación del proyecto

```powershell
npm.cmd run check
npm.cmd audit --omit=dev
```

Si `npm.cmd run check` falla, no hagas commit hasta revisar el error.

## 6. Ver exactamente qué cambió

```powershell
git status
git diff --stat
git diff
```

## 7. Commit y push

Cuando el estado sea el esperado:

```powershell
git add -A
git status
git commit -m "Replace native admin filters and harden adaptive performance"
git push origin main
```

## 8. Variables necesarias en Vercel

Verificá en el proyecto de Vercel que existan las variables requeridas por tu configuración real:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_SITE_URL`
- `RATE_LIMIT_SECRET`
- `MERCADOPAGO_ENABLED`
- `MERCADOPAGO_ACCESS_TOKEN`
- `MERCADOPAGO_WEBHOOK_SECRET`
- `MERCADOPAGO_REQUIRE_SIGNATURE`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `EMAIL_REPLY_TO`
- `BANK_TRANSFER_ALIAS`
- `BANK_TRANSFER_CBU`
- `BANK_TRANSFER_HOLDER`
- `BANK_TRANSFER_TAX_ID`
- `BANK_TRANSFER_BANK`
- `MODO_ENABLED`

No copies secretos desde ningún archivo del ZIP: el ZIP no los contiene.

## 9. Configuración pública de transferencia

Si no definís variables `BANK_TRANSFER_*`, el backend conserva los datos públicos configurados actualmente en `api/public-config.js`.

## 10. Después del deploy

Abrí el sitio desplegado y completá `TEST-CHECKLIST.md`, especialmente:

- carrito
- checkout
- Mercado Pago
- webhook
- stock
- emails
- admin
- galería múltiple
- seguimiento
- responsive móvil/desktop
- consola del navegador
- Lighthouse/Performance

## Importante sobre Supabase

Esta entrega agrega **una migration nueva y no destructiva**: `database/performance-scale-2026-09-27.sql`. Crea índices con `CREATE INDEX IF NOT EXISTS`; no borra productos, pedidos ni reseñas.

Antes de tráfico alto, abrí Supabase > SQL Editor, revisá el archivo y ejecutalo una vez. Si preferís desplegar primero la UI, el sitio seguirá funcionando sin esta migration; los índices son una optimización de escala. No vuelvas a correr archivos de setup completos sobre producción.


## 11. Comprobación específica de motion

Después del deploy, probá especialmente en un teléfono real:

- press feedback de botones;
- apertura/cierre del menú;
- carrito y Mis pedidos con swipe desde sus encabezados;
- cancelación del swipe antes del umbral;
- flick rápido para cerrar;
- `prefers-reduced-motion` desde DevTools/OS.

Si algo visual no te convence, este pass está concentrado principalmente en `assets/css/motion-craft.css` y el bloque `FLUID INPUT & DRAWER GESTURES V3` al final de `assets/js/site.js`, por lo que es fácil ajustar la sensación sin tocar checkout, pagos o backend.
