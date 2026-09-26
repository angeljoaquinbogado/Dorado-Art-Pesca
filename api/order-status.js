import { consumeRateLimit, enforceRateLimit, fetchWithTimeout } from "../lib/security.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeHttpsUrl(value) {
    try {
        const url = new URL(String(value || "").trim());
        return url.protocol === "https:" ? url.toString() : "";
    } catch {
        return "";
    }
}

async function sb(path) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error("Configuración incompleta");

    return fetchWithTimeout(`${url}${path}`, {
        headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            Accept: "application/json"
        }
    }, 8000);
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "order-status",
            limit: 60,
            windowSeconds: 600
        });

        if (enforceRateLimit(
            res,
            rate,
            "Demasiadas consultas de seguimiento. Esperá un momento y volvé a intentar."
        )) return;
    } catch (error) {
        console.error("Order status rate limit error:", error?.message || error);
        return res.status(503).json({ error: "No se pudo consultar el pedido" });
    }

    const id = String(req.query?.id || "").trim();
    const tracking = String(req.query?.tracking || "").trim();

    if (!UUID_RE.test(id) || !UUID_RE.test(tracking)) {
        return res.status(400).json({ error: "Pedido inválido" });
    }

    try {
        let orderResponse = await sb(
            `/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&tracking_token=eq.${encodeURIComponent(tracking)}&select=id,estado,preparacion_estado,created_at,subtotal,descuento_total,cupon_codigo,total,mp_init_point,pago_expira_at,envio_transportista,envio_tracking_codigo,envio_tracking_url,envio_estado,envio_despachado_at,envio_actualizado_at`
        );
        let orders = await orderResponse.json().catch(() => []);

        if (!orderResponse.ok) {
            orderResponse = await sb(
                `/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&tracking_token=eq.${encodeURIComponent(tracking)}&select=id,estado,preparacion_estado,created_at,total`
            );
            orders = await orderResponse.json().catch(() => []);
        }

        if (!orderResponse.ok || !Array.isArray(orders) || !orders[0]) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const order = orders[0];

        const itemsResponse = await sb(
            `/rest/v1/pedido_items?pedido_id=eq.${encodeURIComponent(id)}&select=nombre,cantidad,precio_unitario&order=id.asc`
        );
        const items = await itemsResponse.json().catch(() => []);

        if (!itemsResponse.ok || !Array.isArray(items)) {
            return res.status(502).json({ error: "No se pudo cargar el detalle del pedido" });
        }

        const estado = String(order.estado || "pendiente").toLowerCase();
        const preparacion = String(order.preparacion_estado || "nuevo").toLowerCase();
        const orderCode = `DP-${String(order.id || "").replaceAll("-", "").slice(0, 10).toUpperCase()}`;

        const status =
            estado === "pagado" ? "pagado" :
            ["pagado_revisar_stock", "pago_revisar_monto"].includes(estado) ? "revision" :
            ["pendiente", "pago_pendiente", "error_pago"].includes(estado) ? "pendiente" :
            ["pago_rechazado", "pago_cancelado"].includes(estado) ? "fallido" :
            estado === "reembolsado" ? "reembolsado" :
            estado;

        const expiresAt = order.pago_expira_at ? new Date(order.pago_expira_at) : null;
        const canRetry = ["pendiente", "fallido"].includes(status)
            && String(order.mp_init_point || "").startsWith("https://")
            && expiresAt
            && Number.isFinite(expiresAt.getTime())
            && expiresAt.getTime() > Date.now();

        return res.status(200).json({
            id: order.id,
            code: orderCode,
            status,
            preparation_status: preparacion,
            created_at: order.created_at,
            subtotal: Number(order.subtotal) || Number(order.total) || 0,
            discount: Math.max(0, Number(order.descuento_total) || 0),
            coupon_code: String(order.cupon_codigo || ""),
            total: Number(order.total) || 0,
            payment_expires_at: order.pago_expira_at || null,
            retry_url: canRetry ? String(order.mp_init_point) : "",
            shipping: {
                carrier: String(order.envio_transportista || "").slice(0, 80),
                tracking_code: String(order.envio_tracking_codigo || "").slice(0, 160),
                tracking_url: safeHttpsUrl(order.envio_tracking_url),
                status: String(order.envio_estado || "pendiente"),
                dispatched_at: order.envio_despachado_at || null,
                updated_at: order.envio_actualizado_at || null
            },
            items: items.map(item => ({
                name: String(item.nombre || ""),
                quantity: Math.max(1, Number(item.cantidad) || 1),
                unit_price: Number(item.precio_unitario) || 0
            }))
        });
    } catch (error) {
        console.error("Order status error:", error);
        return res.status(500).json({ error: "No se pudo consultar el pedido" });
    }
}
