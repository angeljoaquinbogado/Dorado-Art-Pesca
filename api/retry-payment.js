import { consumeRateLimit, enforceRateLimit, bodyTooLarge, fetchWithTimeout } from "../lib/security.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETRYABLE = new Set(["pendiente","pago_pendiente","pago_rechazado","pago_cancelado","error_pago"]);

function clean(value, max = 200) {
    return String(value ?? "").trim().slice(0, max);
}

function originFromRequest(req) {
    const configured = clean(process.env.PUBLIC_SITE_URL || "", 250).replace(/\/$/, "");
    if (/^https:\/\//i.test(configured)) return configured;
    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim() === "http" ? "http" : "https";
    const host = clean(req.headers.host || "dorado-art-pesca.vercel.app", 200);
    return `${proto}://${host}`;
}

async function supabaseFetch(path, options = {}) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error("Configuración incompleta");

    return fetchWithTimeout(`${url}${path}`, {
        ...options,
        headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(options.headers || {})
        }
    }, 8000);
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }

    if (bodyTooLarge(req, 12 * 1024)) {
        return res.status(413).json({ error: "Solicitud demasiado grande" });
    }

    const mpEnabled = String(process.env.MERCADOPAGO_ENABLED || "").toLowerCase() === "true";
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpEnabled || !mpToken) {
        return res.status(503).json({ error: "Mercado Pago todavía no está habilitado." });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "retry-payment",
            limit: 12,
            windowSeconds: 600
        });
        if (enforceRateLimit(res, rate, "Demasiados intentos de pago. Esperá unos minutos.")) return;

        const id = clean(req.body?.id, 60);
        const tracking = clean(req.body?.tracking, 60);
        if (!UUID_RE.test(id) || !UUID_RE.test(tracking)) {
            return res.status(400).json({ error: "Pedido inválido" });
        }

        const orderResponse = await supabaseFetch(
            `/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&tracking_token=eq.${encodeURIComponent(tracking)}&select=id,estado,total,cliente_nombre,cliente_email,cliente_telefono,tracking_token,expira_pago_at&limit=1`
        );
        const orders = await orderResponse.json().catch(() => []);
        const order = Array.isArray(orders) ? orders[0] : null;

        if (!orderResponse.ok || !order) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const estado = String(order.estado || "").toLowerCase();
        if (!RETRYABLE.has(estado)) {
            return res.status(409).json({ error: estado === "pagado" ? "Este pedido ya está pagado." : "Este pedido no admite un nuevo intento de pago." });
        }

        const expiresAt = order.expira_pago_at ? new Date(order.expira_pago_at).getTime() : 0;
        if (!expiresAt || Date.now() > expiresAt) {
            return res.status(410).json({ error: "El plazo de 24 horas para completar este pedido ya venció." });
        }

        const total = Math.round((Number(order.total) || 0) * 100) / 100;
        if (total <= 0) {
            return res.status(409).json({ error: "El total del pedido no es válido." });
        }

        const origin = originFromRequest(req);
        const code = `DP-${String(order.id).replaceAll("-", "").slice(0, 10).toUpperCase()}`;
        const preference = {
            items: [{
                id: String(order.id),
                title: `Pedido ${code} · Dorado Artículos de Pesca`,
                quantity: 1,
                unit_price: total,
                currency_id: "ARS"
            }],
            payer: {
                name: clean(order.cliente_nombre, 100),
                email: clean(order.cliente_email, 160),
                phone: { number: clean(order.cliente_telefono, 40) }
            },
            external_reference: String(order.id),
            notification_url: `${origin}/api/mercadopago-webhook`,
            back_urls: {
                success: `${origin}/?checkout=success&order=${encodeURIComponent(order.id)}&tracking=${encodeURIComponent(tracking)}`,
                pending: `${origin}/?checkout=pending&order=${encodeURIComponent(order.id)}&tracking=${encodeURIComponent(tracking)}`,
                failure: `${origin}/?checkout=failure&order=${encodeURIComponent(order.id)}&tracking=${encodeURIComponent(tracking)}`
            },
            auto_return: "approved",
            statement_descriptor: "DORADO PESCA",
            metadata: { pedido_id: String(order.id), retry: true }
        };

        const mpResponse = await fetchWithTimeout("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${mpToken}`,
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(preference)
        }, 10000);

        const mpData = await mpResponse.json().catch(() => ({}));
        if (!mpResponse.ok || !mpData?.id || !mpData?.init_point) {
            console.error("Retry Mercado Pago preference error", { status: mpResponse.status });
            return res.status(502).json({ error: "No pudimos preparar un nuevo intento de pago." });
        }

        await supabaseFetch(`/rest/v1/pedidos?id=eq.${encodeURIComponent(order.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
                mp_preference_id: String(mpData.id),
                estado: "pendiente"
            })
        });

        return res.status(200).json({
            init_point: mpData.init_point,
            expires_at: order.expira_pago_at
        });
    } catch (error) {
        console.error("Retry payment error:", error);
        return res.status(500).json({ error: "No pudimos preparar el pago." });
    }
}
