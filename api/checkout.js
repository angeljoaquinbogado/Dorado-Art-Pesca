import { consumeRateLimit, enforceRateLimit, bodyTooLarge, fetchWithTimeout } from "../lib/security.js";

const MAX_ITEMS = 40;
const MAX_QTY = 99;
const DELIVERY_METHODS = new Set(["retiro", "local", "nacional", "coordinar"]);

function clean(value, max = 200) {
    return String(value ?? "").trim().slice(0, max);
}

function emailValido(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function originFromRequest(req) {
    const configured = clean(process.env.PUBLIC_SITE_URL || "", 250).replace(/\/$/, "");
    if (/^https:\/\//i.test(configured)) return configured;

    const forwarded = clean(req.headers["x-forwarded-proto"] || "https", 10);
    const proto = forwarded === "http" ? "http" : "https";
    const host = clean(req.headers.host || "", 200);
    if (!host) return "https://dorado-art-pesca.vercel.app";
    return `${proto}://${host}`;
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

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const contentLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(contentLength) && contentLength > 50_000) {
        return res.status(413).json({ error: "La solicitud es demasiado grande." });
    }

    const requestOrigin = String(req.headers.origin || "").trim();
    const requestHost = String(req.headers.host || "").trim();

    if (requestOrigin) {
        try {
            if (new URL(requestOrigin).host !== requestHost) {
                return res.status(403).json({ error: "Origen no autorizado" });
            }
        } catch {
            return res.status(403).json({ error: "Origen no autorizado" });
        }
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!mpToken || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(503).json({
            error: "Los pagos todavía no fueron habilitados por el comercio."
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

            if (!id || cantidad < 1 || cantidad > MAX_QTY) {
                return res.status(400).json({ error: "Hay una cantidad de producto inválida." });
            }

            const acumulada = (cantidades.get(id) || 0) + cantidad;
            if (acumulada > MAX_QTY) {
                return res.status(400).json({ error: "La cantidad total de un producto es inválida." });
            }
            cantidades.set(id, acumulada);
        }

        const catalogResponse = await supabaseFetch(
            "/rest/v1/productos?select=id,nombre,precio,stock,activo&activo=eq.true"
        );

        const catalog = await catalogResponse.json().catch(() => []);

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
            const precio = Math.max(0, Number(producto.precio) || 0);

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

        total = Math.round(total * 100) / 100;

        if (total <= 0) {
            return res.status(400).json({ error: "El total del pedido no es válido." });
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

        const origin = originFromRequest(req);

        const preference = {
            items: orderItems.map(item => ({
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
            console.error("Mercado Pago preference error:", mpData);
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
                mp_preference_id: String(mpData.id)
            })
        });

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
