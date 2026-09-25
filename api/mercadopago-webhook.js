import { sendOrderStatusEmail } from "../lib/order-email.js";
import {
    consumeRateLimit,
    enforceRateLimit,
    verifyMercadoPagoSignature,
    bodyTooLarge,
    fetchWithTimeout
} from "../lib/security.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function supabaseFetch(path, options = {}) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const headers = {
        apikey: service,
        Authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
    };

    return fetchWithTimeout(`${url}${path}`, { ...options, headers }, 8000);
}

function extractPaymentId(req) {
    const bodyId = req.body?.data?.id || req.body?.id;
    const queryId = req.query?.["data.id"] || req.query?.id;
    return String(bodyId || queryId || "").trim();
}

function publicOrigin(req) {
    const configured = String(process.env.PUBLIC_SITE_URL || "").trim().replace(/\/$/, "");
    if (/^https:\/\//i.test(configured)) return configured;

    const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    const host = String(req.headers.host || "dorado-art-pesca.vercel.app").trim();
    return `${proto === "http" ? "http" : "https"}://${host}`;
}

async function sendStatusEmailOnce({ order, event, req }) {
    const claimResponse = await supabaseFetch(
        "/rest/v1/rpc/claim_pedido_email_evento",
        {
            method: "POST",
            body: JSON.stringify({
                p_pedido_id: order.id,
                p_evento: event
            })
        }
    );
    const claimData = await claimResponse.json().catch(() => null);

    if (!claimResponse.ok) {
        throw new Error(`No se pudo reclamar el email ${event}`);
    }
    if (!claimData?.claimed) {
        return { skipped: true, reason: claimData?.reason || "not_claimed" };
    }

    try {
        const itemsResponse = await supabaseFetch(
            `/rest/v1/pedido_items?pedido_id=eq.${encodeURIComponent(order.id)}&select=nombre,cantidad,precio_unitario,precio_lista&order=id.asc`
        );
        const items = await itemsResponse.json().catch(() => []);

        if (!itemsResponse.ok || !Array.isArray(items)) {
            throw new Error("No se pudo cargar el detalle para el email");
        }

        const result = await sendOrderStatusEmail({
            order,
            items,
            event,
            origin: publicOrigin(req)
        });

        await supabaseFetch(
            "/rest/v1/rpc/finalizar_pedido_email_evento",
            {
                method: "POST",
                body: JSON.stringify({
                    p_pedido_id: order.id,
                    p_evento: event,
                    p_enviado: Boolean(result?.sent)
                })
            }
        );

        if (!result?.sent && !result?.skipped) {
            throw new Error("El proveedor de email no confirmó el envío");
        }

        return result;
    } catch (error) {
        await supabaseFetch(
            "/rest/v1/rpc/finalizar_pedido_email_evento",
            {
                method: "POST",
                body: JSON.stringify({
                    p_pedido_id: order.id,
                    p_evento: event,
                    p_enviado: false
                })
            }
        ).catch(() => null);

        throw error;
    }
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "GET") {
        return res.status(200).json({ ok: true });
    }

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST, GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!token || !service || !process.env.SUPABASE_URL) {
        return res.status(500).json({ error: "Configuración incompleta" });
    }

    if (bodyTooLarge(req, 64 * 1024)) {
        return res.status(413).json({ error: "Solicitud demasiado grande" });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "mercadopago-webhook",
            limit: 100,
            windowSeconds: 60
        });

        if (enforceRateLimit(res, rate, "Demasiadas notificaciones.")) return;

        const topic = String(
            req.query?.topic ||
            req.query?.type ||
            req.body?.type ||
            req.body?.topic ||
            ""
        ).toLowerCase();

        if (topic === "merchant_order") {
            console.log("Webhook merchant_order ignorado correctamente");
            return res.status(200).json({
                ok: true,
                ignored: true,
                reason: "merchant_order"
            });
        }

        const paymentId = extractPaymentId(req);

        if (!paymentId) {
            return res.status(200).json({ ok: true, ignored: true });
        }

        const signature = verifyMercadoPagoSignature(req, paymentId);

        if (signature.required && !signature.configured) {
            console.error("Mercado Pago webhook signature is required but not configured");
            return res.status(503).json({ error: "Firma del webhook no configurada" });
        }

        if (signature.configured && !signature.valid) {
            console.warn("Mercado Pago webhook rejected: invalid signature");
            return res.status(401).json({ error: "Firma inválida" });
        }

        const mpResponse = await fetchWithTimeout(
            `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            },
            10000
        );

        const payment = await mpResponse.json().catch(() => ({}));

        if (!mpResponse.ok) {
            console.error("MP payment lookup failed", {
                status: mpResponse.status,
                paymentId
            });
            return res.status(502).json({ error: "No se pudo verificar el pago" });
        }

        const externalOrderId = String(payment.external_reference || "").trim();
        const metadataOrderId = String(payment.metadata?.pedido_id || "").trim();

        if (externalOrderId && metadataOrderId && externalOrderId !== metadataOrderId) {
            console.warn("Payment order reference mismatch", { paymentId: String(payment.id || "") });
            return res.status(200).json({ ok: true, ignored: true, reason: "order_reference_mismatch" });
        }

        const orderId = externalOrderId || metadataOrderId;
        if (!UUID_RE.test(orderId)) {
            return res.status(200).json({ ok: true, ignored: true, reason: "invalid_order_reference" });
        }

        const orderResponse = await supabaseFetch(
            `/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}&select=id,total,subtotal,descuento_productos,descuento_cupon,cupon_codigo,estado,mp_payment_id,cliente_nombre,cliente_email,tracking_token,expira_pago_at`
        );

        const orders = await orderResponse.json().catch(() => []);

        if (!orderResponse.ok || !Array.isArray(orders) || !orders[0]) {
            console.error("Order not found for payment:", orderId);
            return res.status(200).json({ ok: true, ignored: true });
        }

        const order = orders[0];
        const paidAmount = Number(payment.transaction_amount) || 0;
        const expectedAmount = Number(order.total) || 0;
        const status = String(payment.status || "").toLowerCase();

        if (status === "approved") {
            const currency = String(payment.currency_id || "").toUpperCase();
            if ((currency && currency !== "ARS") || Math.abs(paidAmount - expectedAmount) > 0.01) {
                const stateResponse = await supabaseFetch(
                    "/rest/v1/rpc/registrar_estado_pago",
                    {
                        method: "POST",
                        body: JSON.stringify({
                            p_pedido_id: orderId,
                            p_payment_id: String(payment.id),
                            p_estado: "pago_revisar_monto"
                        })
                    }
                );
                const stateData = await stateResponse.json().catch(() => null);

                if (!stateResponse.ok) {
                    console.error("registrar_estado_pago failed", {
                        status: stateResponse.status,
                        orderId
                    });
                    return res.status(500).json({ error: "No se pudo actualizar el pedido" });
                }

                console.error("Payment amount/currency mismatch", {
                    orderId,
                    expectedAmount,
                    paidAmount,
                    currency
                });

                return res.status(200).json({
                    ok: true,
                    review: true,
                    result: stateData
                });
            }

            const rpcResponse = await supabaseFetch(
                "/rest/v1/rpc/confirmar_pago_pedido",
                {
                    method: "POST",
                    body: JSON.stringify({
                        p_pedido_id: orderId,
                        p_payment_id: String(payment.id)
                    })
                }
            );

            const rpcData = await rpcResponse.json().catch(() => null);

            if (!rpcResponse.ok) {
                console.error("confirmar_pago_pedido failed:", rpcData);
                return res.status(500).json({ error: "No se pudo confirmar el pedido" });
            }

            if (rpcData?.ok) {
                try {
                    await sendStatusEmailOnce({ order, event: "pagado", req });
                } catch (emailError) {
                    console.error("Order paid email failed:", emailError?.message || emailError);
                    return res.status(500).json({
                        error: "Pedido confirmado; email pendiente de reintento"
                    });
                }
            }

            return res.status(200).json({ ok: true, result: rpcData });
        }

        const estadoMap = {
            pending: "pago_pendiente",
            in_process: "pago_pendiente",
            rejected: "pago_rechazado",
            cancelled: "pago_cancelado",
            refunded: "reembolsado",
            charged_back: "contracargo"
        };

        const nuevoEstado = estadoMap[status];

        if (!nuevoEstado) {
            return res.status(200).json({
                ok: true,
                ignored: true,
                reason: "payment_status_not_mapped"
            });
        }

        const stateResponse = await supabaseFetch(
            "/rest/v1/rpc/registrar_estado_pago",
            {
                method: "POST",
                body: JSON.stringify({
                    p_pedido_id: orderId,
                    p_payment_id: String(payment.id || ""),
                    p_estado: nuevoEstado
                })
            }
        );
        const stateData = await stateResponse.json().catch(() => null);

        if (!stateResponse.ok) {
            console.error("registrar_estado_pago failed", {
                status: stateResponse.status,
                orderId
            });
            return res.status(500).json({ error: "No se pudo actualizar el pedido" });
        }

        const event =
            status === "pending" || status === "in_process" ? "pendiente" :
            status === "rejected" || status === "cancelled" ? "cancelado" :
            "";

        if (event && !stateData?.ignored) {
            try {
                await sendStatusEmailOnce({ order, event, req });
            } catch (emailError) {
                console.error(`Order ${event} email failed:`, emailError?.message || emailError);
                return res.status(500).json({
                    error: "Estado actualizado; email pendiente de reintento"
                });
            }
        }

        return res.status(200).json({ ok: true, result: stateData });

    } catch (error) {
        console.error("Webhook error:", error);
        return res.status(500).json({ error: "Webhook error" });
    }
}
