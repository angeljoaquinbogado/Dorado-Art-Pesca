import { consumeRateLimit, enforceRateLimit, fetchWithTimeout } from "../lib/security.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function sb(path, options = {}) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error("Configuración incompleta");

    const headers = {
        apikey: service,
        Authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
    };

    return fetchWithTimeout(`${url}${path}`, { ...options, headers }, 8000);
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const id = String(req.query?.id || "").trim();
    const tracking = String(req.query?.tracking || "").trim();

    if (!UUID_RE.test(id) || !UUID_RE.test(tracking)) {
        return res.status(400).json({ error: "Pedido inválido" });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "payment-reconcile",
            limit: 8,
            windowSeconds: 600,
            subject: id
        });

        if (enforceRateLimit(
            res,
            rate,
            "Esperá unos minutos antes de volver a comprobar el pago."
        )) return;

        const orderResponse = await sb(
            `/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&tracking_token=eq.${encodeURIComponent(tracking)}&select=id,total,estado,mp_payment_id&limit=1`
        );
        const orders = await orderResponse.json().catch(() => []);

        if (!orderResponse.ok || !Array.isArray(orders) || !orders[0]) {
            return res.status(404).json({ error: "Pedido no encontrado" });
        }

        const order = orders[0];

        if (String(order.estado || "").toLowerCase() === "pagado") {
            return res.status(200).json({ ok: true, status: "pagado", already_paid: true });
        }

        const token = String(process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
        if (!token) {
            return res.status(503).json({ error: "Mercado Pago no está configurado" });
        }

        const mpResponse = await fetchWithTimeout(
            `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(id)}&sort=date_created&criteria=desc&limit=20`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json"
                }
            },
            10000
        );

        const mpData = await mpResponse.json().catch(() => ({}));

        if (!mpResponse.ok) {
            console.error("MP reconcile search failed", {
                status: mpResponse.status,
                orderId: id
            });
            return res.status(502).json({ error: "No se pudo comprobar el pago" });
        }

        const results = Array.isArray(mpData?.results) ? mpData.results : [];
        const expected = Number(order.total) || 0;

        const approved = results.find(payment => {
            const sameReference = String(payment?.external_reference || "") === id;
            const approvedStatus = String(payment?.status || "").toLowerCase() === "approved";
            const amount = Number(payment?.transaction_amount) || 0;
            const currency = String(payment?.currency_id || "").toUpperCase();

            return sameReference
                && approvedStatus
                && currency === "ARS"
                && Math.abs(amount - expected) <= 0.01;
        });

        if (!approved?.id) {
            const current = results.find(payment => {
                const sameReference = String(payment?.external_reference || "") === id;
                const amount = Number(payment?.transaction_amount) || 0;
                const currency = String(payment?.currency_id || "").toUpperCase();
                return sameReference && currency === "ARS" && Math.abs(amount - expected) <= 0.01;
            });

            const currentStatus = String(current?.status || "").toLowerCase();
            const currentPaymentId = String(current?.id || "");

            if (currentPaymentId && ["refunded", "charged_back"].includes(currentStatus)) {
                const mapped = currentStatus === "charged_back" ? "contracargo" : "reembolsado";
                const stateResponse = await sb("/rest/v1/rpc/registrar_estado_pago", {
                    method: "POST",
                    body: JSON.stringify({
                        p_pedido_id: id,
                        p_payment_id: currentPaymentId,
                        p_estado: mapped
                    })
                });
                const stateData = await stateResponse.json().catch(() => null);

                if (!stateResponse.ok || stateData?.ok === false) {
                    console.error("Payment reconcile terminal-state RPC failed", {
                        status: stateResponse.status,
                        orderId: id,
                        paymentStatus: currentStatus,
                        result: stateData
                    });
                    return res.status(500).json({ error: "No se pudo actualizar el estado final del pago" });
                }

                return res.status(200).json({
                    ok: true,
                    status: mapped,
                    reconciled: true,
                    stock_restaurado: Boolean(stateData?.stock_restaurado)
                });
            }

            if (currentPaymentId && ["pending", "in_process", "rejected", "cancelled"].includes(currentStatus)) {
                const mapped = ["pending", "in_process"].includes(currentStatus)
                    ? "pago_pendiente"
                    : currentStatus === "rejected"
                        ? "pago_rechazado"
                        : "pago_cancelado";

                await sb("/rest/v1/rpc/registrar_estado_pago", {
                    method: "POST",
                    body: JSON.stringify({
                        p_pedido_id: id,
                        p_payment_id: currentPaymentId,
                        p_estado: mapped
                    })
                }).catch(() => null);
            }

            return res.status(200).json({
                ok: true,
                status: currentStatus || "pendiente",
                found: results.length,
                observed_statuses: results.slice(0, 5).map(payment => ({
                    status: String(payment?.status || ""),
                    status_detail: String(payment?.status_detail || "")
                }))
            });
        }

        const confirmResponse = await sb("/rest/v1/rpc/confirmar_pago_pedido", {
            method: "POST",
            body: JSON.stringify({
                p_pedido_id: id,
                p_payment_id: String(approved.id)
            })
        });
        const confirmData = await confirmResponse.json().catch(() => null);

        if (!confirmResponse.ok) {
            console.error("Payment reconcile confirm failed", {
                status: confirmResponse.status,
                orderId: id,
                result: confirmData
            });
            return res.status(500).json({
                error: "El pago fue encontrado pero no se pudo confirmar el pedido"
            });
        }

        if (!confirmData?.ok) {
            const reviewReason = String(confirmData?.reason || "");
            if (confirmData?.review || ["pedido_cancelado", "stock_insuficiente", "stock_en_revision"].includes(reviewReason)) {
                return res.status(200).json({
                    ok: true,
                    status: reviewReason === "pedido_cancelado"
                        ? "pagado_cancelado_revisar"
                        : "pagado_revisar_stock",
                    reconciled: true,
                    review: true,
                    reason: reviewReason
                });
            }

            console.error("Payment reconcile confirmation returned non-ok result", {
                orderId: id,
                result: confirmData
            });
            return res.status(500).json({
                error: "El pago fue encontrado pero el pedido necesita revisión"
            });
        }

        return res.status(200).json({
            ok: true,
            status: "pagado",
            reconciled: true
        });
    } catch (error) {
        console.error("Payment reconcile error:", error?.message || error);
        return res.status(500).json({ error: "No se pudo comprobar el pago" });
    }
}
