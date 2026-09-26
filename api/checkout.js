import {
    consumeRateLimit,
    enforceRateLimit,
    bodyTooLarge,
    fetchWithTimeout,
    publicSiteOrigin,
    isSameOriginRequest,
    requireJsonRequest
} from "../lib/security.js";
import { productPrice, normalizeCouponCode, couponStatus, roundMoney } from "../lib/pricing.js";
import { sendOrderStatusEmail } from "../lib/order-email.js";

const MAX_ITEMS = 40;
const MAX_QTY = 99;
const DELIVERY_METHODS = new Set(["retiro", "local", "nacional", "coordinar"]);

function clean(value, max = 200) {
    return String(value ?? "").trim().slice(0, max);
}

function emailValido(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}


async function supabaseFetch(path, options = {}) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !service) {
        throw new Error("Supabase server credentials missing");
    }

    const headers = {
        apikey: service,
        Authorization: `Bearer ${service}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {})
    };

    return fetchWithTimeout(`${url}${path}`, { ...options, headers }, 8000);
}

async function notifyOrderEmail({ type, order, items, origin, paymentUrl = "", expiresAt = null }) {
    const claimResponse = await supabaseFetch("/rest/v1/rpc/claim_order_email", {
        method: "POST",
        body: JSON.stringify({ p_pedido_id: order.id, p_tipo: type })
    });
    const claim = await claimResponse.json().catch(() => null);
    if (!claimResponse.ok || !claim?.claimed) return;

    let sent = false;
    try {
        const result = await sendOrderStatusEmail({ kind: type, order, items, origin, paymentUrl, expiresAt });
        sent = Boolean(result?.sent);
    } finally {
        await supabaseFetch("/rest/v1/rpc/finalize_order_email", {
            method: "POST",
            body: JSON.stringify({ p_pedido_id: order.id, p_tipo: type, p_enviado: sent })
        }).catch(() => null);
    }
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }

    if (!requireJsonRequest(req)) {
        return res.status(415).json({ error: "Formato de solicitud no compatible." });
    }

    if (!isSameOriginRequest(req)) {
        return res.status(403).json({ error: "Origen no autorizado" });
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > 50_000) {
        return res.status(413).json({ error: "La solicitud es demasiado grande." });
    }

    const mpEnabled = String(process.env.MERCADOPAGO_ENABLED || "").toLowerCase() === "true";
    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpEnabled || !mpToken || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({
            error: "Mercado Pago todavía no fue habilitado por el comercio. Podés coordinar tu pedido por WhatsApp."
        });
    }

    try {
        if (bodyTooLarge(req, 48 * 1024)) {
            return res.status(413).json({ error: "La solicitud es demasiado grande." });
        }

        const rate = await consumeRateLimit(req, {
            scope: "checkout",
            limit: 10,
            windowSeconds: 600
        });

        if (enforceRateLimit(
            res,
            rate,
            "Hubo demasiados intentos de compra desde esta conexión. Esperá unos minutos y volvé a intentar."
        )) return;

        const body = req.body && typeof req.body === "object" ? req.body : {};
        const clienteRaw = body.cliente || {};
        const itemsRaw = Array.isArray(body.items) ? body.items : [];
        const couponCode = normalizeCouponCode(body.cupon || body.coupon || "");

        const cliente = {
            nombre: clean(clienteRaw.nombre, 100),
            email: clean(clienteRaw.email, 160).toLowerCase(),
            telefono: clean(clienteRaw.telefono, 40),
            domicilio: clean(clienteRaw.domicilio, 180),
            ciudad: clean(clienteRaw.ciudad, 100),
            provincia: clean(clienteRaw.provincia, 100),
            codigo_postal: clean(clienteRaw.codigo_postal, 12),
            entrega: clean(clienteRaw.entrega, 30),
            notas: clean(clienteRaw.notas, 500)
        };

        const esRetiro = (cliente.entrega || "retiro") === "retiro";
        if (
            !cliente.nombre ||
            !cliente.email ||
            !emailValido(cliente.email) ||
            !cliente.telefono ||
            (!esRetiro && (!cliente.domicilio || !cliente.ciudad || !cliente.provincia || !cliente.codigo_postal))
        ) {
            return res.status(400).json({ error: "Revisá los datos de contacto y entrega." });
        }
        if (esRetiro) {
            cliente.domicilio = cliente.domicilio || "Retiro en el local";
            cliente.ciudad = cliente.ciudad || "San Fernando";
            cliente.provincia = cliente.provincia || "Buenos Aires";
            cliente.codigo_postal = cliente.codigo_postal || "0000";
        }

        if (!DELIVERY_METHODS.has(cliente.entrega || "retiro")) {
            return res.status(400).json({ error: "El método de entrega no es válido." });
        }

        if (itemsRaw.length < 1 || itemsRaw.length > MAX_ITEMS) {
            return res.status(400).json({ error: "El carrito no es válido." });
        }

        const cantidades = new Map();

        for (const item of itemsRaw) {
            const id = String(item?.id ?? "").trim();
            const cantidad = Math.floor(Number(item?.cantidad) || 0);

            if (!/^\d{1,19}$/.test(id) || cantidad < 1 || cantidad > MAX_QTY) {
                return res.status(400).json({ error: "Hay una cantidad de producto inválida." });
            }

            const acumulada = (cantidades.get(id) || 0) + cantidad;
            if (acumulada > MAX_QTY) {
                return res.status(400).json({ error: "La cantidad total de un producto es inválida." });
            }
            cantidades.set(id, acumulada);
        }

        let catalogResponse = await supabaseFetch(
            "/rest/v1/productos?select=id,nombre,precio,descuento_porcentaje,stock,activo&activo=eq.true"
        );
        let catalog = await catalogResponse.json().catch(() => []);

        if (!catalogResponse.ok) {
            catalogResponse = await supabaseFetch(
                "/rest/v1/productos?select=id,nombre,precio,stock,activo&activo=eq.true"
            );
            catalog = await catalogResponse.json().catch(() => []);
        }

        if (!catalogResponse.ok || !Array.isArray(catalog)) {
            console.error("Catalog validation error:", catalog);
            return res.status(502).json({ error: "No pudimos validar el catálogo." });
        }

        const catalogMap = new Map(catalog.map(p => [String(p.id), p]));
        const orderItems = [];
        let total = 0;

        for (const [id, cantidad] of cantidades) {
            const producto = catalogMap.get(id);

            if (!producto || !producto.activo) {
                return res.status(409).json({ error: "Uno de los productos ya no está disponible." });
            }

            const stock = Math.max(0, Number(producto.stock) || 0);
            const precio = productPrice(producto).final;

            if (cantidad > stock) {
                return res.status(409).json({
                    error: `${clean(producto.nombre, 100)} ya no tiene el stock solicitado.`
                });
            }

            if (precio <= 0) {
                return res.status(409).json({ error: "Uno de los productos tiene un precio inválido." });
            }

            orderItems.push({
                producto_id: producto.id,
                nombre: clean(producto.nombre, 160),
                cantidad,
                precio_unitario: precio
            });

            total += precio * cantidad;
        }

        total = roundMoney(total);

        if (total <= 0) {
            return res.status(400).json({ error: "El total del pedido no es válido." });
        }

        const subtotal = total;
        let descuentoTotal = 0;
        let coupon = null;

        if (couponCode) {
            const couponResponse = await supabaseFetch(
                `/rest/v1/cupones?codigo=eq.${encodeURIComponent(couponCode)}&select=id,codigo,tipo,valor,minimo_compra,activo,vigente_desde,vigente_hasta,limite_usos,usos&limit=1`
            );
            const coupons = await couponResponse.json().catch(() => []);
            if (!couponResponse.ok || !Array.isArray(coupons)) {
                return res.status(502).json({ error: "No pudimos validar el cupón." });
            }
            coupon = coupons[0] || null;
            const couponResult = couponStatus(coupon, subtotal);
            if (!couponResult.valid) {
                return res.status(400).json({ error: couponResult.reason || "El cupón no es válido." });
            }
            descuentoTotal = couponResult.discount;
            total = couponResult.total;
        }

        const orderResponse = await supabaseFetch(
            "/rest/v1/pedidos",
            {
                method: "POST",
                headers: { Prefer: "return=representation" },
                body: JSON.stringify({
                    cliente_nombre: cliente.nombre,
                    cliente_email: cliente.email,
                    cliente_telefono: cliente.telefono,
                    domicilio: cliente.domicilio,
                    ciudad: cliente.ciudad,
                    provincia: cliente.provincia,
                    codigo_postal: cliente.codigo_postal,
                    metodo_entrega: cliente.entrega || "retiro",
                    notas: cliente.notas || null,
                    subtotal,
                    descuento_total: descuentoTotal,
                    cupon_id: coupon?.id || null,
                    cupon_codigo: coupon?.codigo || null,
                    total,
                    estado: "pendiente"
                })
            }
        );

        const orderData = await orderResponse.json().catch(() => []);

        if (!orderResponse.ok || !Array.isArray(orderData) || !orderData[0]?.id) {
            console.error("Order insert error:", orderData);
            return res.status(500).json({ error: "No pudimos crear el pedido." });
        }

        const order = orderData[0];
        const orderId = order.id;
        const trackingToken = String(order.tracking_token || "");

        if (!trackingToken) {
            console.error("Order tracking token missing:", orderId);
            return res.status(500).json({ error: "No pudimos preparar el seguimiento del pedido." });
        }

        const itemsResponse = await supabaseFetch(
            "/rest/v1/pedido_items",
            {
                method: "POST",
                body: JSON.stringify(
                    orderItems.map(item => ({ ...item, pedido_id: orderId }))
                )
            }
        );

        if (!itemsResponse.ok) {
            console.error("Order items insert error:", await itemsResponse.text());
            await supabaseFetch(`/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}`, {
                method: "PATCH",
                body: JSON.stringify({ estado: "error_items" })
            });
            return res.status(500).json({ error: "No pudimos guardar el detalle del pedido." });
        }

        const origin = publicSiteOrigin(req);
        const paymentStartsAt = new Date();
        const paymentExpiresAt = new Date(paymentStartsAt.getTime() + 24 * 60 * 60 * 1000);

        const preference = {
            items: coupon
                ? [{
                    id: `pedido-${String(orderId)}`,
                    title: `Pedido DORADO · Cupón ${coupon.codigo}`,
                    quantity: 1,
                    unit_price: total,
                    currency_id: "ARS"
                }]
                : orderItems.map(item => ({
                    id: String(item.producto_id),
                    title: item.nombre,
                    quantity: item.cantidad,
                    unit_price: item.precio_unitario,
                    currency_id: "ARS"
                })),
            payer: {
                name: cliente.nombre,
                email: cliente.email,
                phone: { number: cliente.telefono }
            },
            external_reference: String(orderId),
            notification_url: `${origin}/api/mercadopago-webhook`,
            back_urls: {
                success: `${origin}/?checkout=success&order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(trackingToken)}`,
                pending: `${origin}/?checkout=pending&order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(trackingToken)}`,
                failure: `${origin}/?checkout=failure&order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(trackingToken)}`
            },
            auto_return: "approved",
            expires: true,
            expiration_date_from: paymentStartsAt.toISOString(),
            expiration_date_to: paymentExpiresAt.toISOString(),
            statement_descriptor: "DORADO PESCA",
            metadata: {
                pedido_id: String(orderId)
            }
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
            console.error("Mercado Pago preference error", {
                status: mpResponse.status,
                error: String(mpData?.error || "").slice(0, 120),
                message: String(mpData?.message || "").slice(0, 180)
            });
            await supabaseFetch(`/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}`, {
                method: "PATCH",
                body: JSON.stringify({ estado: "error_pago" })
            });
            return res.status(502).json({
                error: "Mercado Pago no pudo iniciar el pago. Intentá nuevamente."
            });
        }

        await supabaseFetch(`/rest/v1/pedidos?id=eq.${encodeURIComponent(orderId)}`, {
            method: "PATCH",
            body: JSON.stringify({
                mp_preference_id: String(mpData.id),
                mp_init_point: String(mpData.init_point),
                pago_expira_at: paymentExpiresAt.toISOString()
            })
        });

        const emailOrder = {
            ...order,
            subtotal,
            descuento_total: descuentoTotal,
            cupon_codigo: coupon?.codigo || null,
            total,
            mp_init_point: String(mpData.init_point),
            pago_expira_at: paymentExpiresAt.toISOString()
        };
        try {
            await notifyOrderEmail({
                type: "pending",
                order: emailOrder,
                items: orderItems,
                origin,
                paymentUrl: String(mpData.init_point),
                expiresAt: paymentExpiresAt.toISOString()
            });
        } catch (emailError) {
            console.error("Pending order email failed:", emailError?.message || emailError);
        }

        return res.status(200).json({
            order_id: orderId,
            order_code: `DP-${String(orderId).replaceAll("-", "").slice(0, 10).toUpperCase()}`,
            tracking_token: trackingToken,
            tracking_url: `${origin}/pedido.html?id=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(trackingToken)}`,
            init_point: mpData.init_point
        });

    } catch (error) {
        console.error("Checkout error:", error);
        return res.status(500).json({
            error: "Ocurrió un error preparando el pago. Intentá nuevamente."
        });
    }
}
