import { consumeRateLimit, enforceRateLimit, bodyTooLarge, fetchWithTimeout } from "../lib/security.js";

const MAX_ITEMS = 40;
const MAX_QTY = 99;
const DELIVERY_METHODS = new Set(["retiro", "local", "nacional", "coordinar"]);

function clean(value, max = 200) {
    return String(value ?? "").trim().slice(0, max);
}

function normalizeCoupon(value) {
    return clean(value, 40).toUpperCase().replace(/\s+/g, "");
}

function emailValido(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
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

async function validateCoupon(codeRaw, subtotal) {
    const code = normalizeCoupon(codeRaw);
    if (!code) return null;

    const response = await supabaseFetch(
        `/rest/v1/cupones?codigo=eq.${encodeURIComponent(code)}&select=id,codigo,tipo,valor,minimo_compra,activo,valido_desde,valido_hasta&limit=1`
    );
    const rows = await response.json().catch(() => []);

    if (!response.ok || !Array.isArray(rows)) {
        throw Object.assign(new Error("No pudimos validar el cupón."), { status: 502 });
    }

    const coupon = rows[0];
    if (!coupon || !coupon.activo) {
        throw Object.assign(new Error("El cupón no existe o no está activo."), { status: 409 });
    }

    const now = Date.now();
    if (coupon.valido_desde && new Date(coupon.valido_desde).getTime() > now) {
        throw Object.assign(new Error("Este cupón todavía no está vigente."), { status: 409 });
    }
    if (coupon.valido_hasta && new Date(coupon.valido_hasta).getTime() < now) {
        throw Object.assign(new Error("Este cupón ya venció."), { status: 409 });
    }

    const minimum = Math.max(0, Number(coupon.minimo_compra) || 0);
    if (subtotal + 0.001 < minimum) {
        throw Object.assign(new Error("El carrito no alcanza el mínimo requerido por este cupón."), { status: 409 });
    }

    const value = Math.max(0, Number(coupon.valor) || 0);
    const discount = coupon.tipo === "fijo"
        ? Math.min(subtotal, value)
        : Math.min(subtotal, subtotal * Math.min(100, value) / 100);

    return {
        code: normalizeCoupon(coupon.codigo),
        discount: roundMoney(discount)
    };
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
        const couponCode = normalizeCoupon(body.coupon_code || "");

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
            "/rest/v1/productos?select=id,nombre,precio,descuento_porcentaje,stock,activo&activo=eq.true"
        );

        const catalog = await catalogResponse.json().catch(() => []);

        if (!catalogResponse.ok || !Array.isArray(catalog)) {
            console.error("Catalog validation error:", catalog);
            return res.status(502).json({ error: "No pudimos validar el catálogo." });
        }

        const catalogMap = new Map(catalog.map(p => [String(p.id), p]));
        const orderItems = [];
        let subtotalLista = 0;
        let subtotal = 0;

        for (const [id, cantidad] of cantidades) {
            const producto = catalogMap.get(id);

            if (!producto || !producto.activo) {
                return res.status(409).json({ error: "Uno de los productos ya no está disponible." });
            }

            const stock = Math.max(0, Number(producto.stock) || 0);
            const precioLista = Math.max(0, Number(producto.precio) || 0);
            const descuento = Math.min(95, Math.max(0, Number(producto.descuento_porcentaje) || 0));
            const precio = roundMoney(precioLista * (1 - descuento / 100));

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
                precio_unitario: precio,
                precio_lista: precioLista
            });

            subtotalLista += precioLista * cantidad;
            subtotal += precio * cantidad;
        }

        subtotalLista = roundMoney(subtotalLista);
        subtotal = roundMoney(subtotal);

        if (subtotal <= 0) {
            return res.status(400).json({ error: "El total del pedido no es válido." });
        }

        const coupon = couponCode ? await validateCoupon(couponCode, subtotal) : null;
        const descuentoCupon = coupon?.discount || 0;
        const descuentoProductos = roundMoney(Math.max(0, subtotalLista - subtotal));
        const total = roundMoney(Math.max(0, subtotal - descuentoCupon));

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
                    subtotal: subtotalLista,
                    descuento_productos: descuentoProductos,
                    descuento_cupon: descuentoCupon,
                    cupon_codigo: coupon?.code || null,
                    total,
                    estado: "pendiente",
                    expira_pago_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
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
        const preferenceItems = descuentoCupon > 0
            ? [{
                id: String(orderId),
                title: `Pedido Dorado · cupón ${coupon.code}`,
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
            }));

        const preference = {
            items: preferenceItems,
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
                pedido_id: String(orderId),
                cupon_codigo: coupon?.code || ""
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
            init_point: mpData.init_point,
            subtotal: subtotalLista,
            discount: roundMoney(descuentoProductos + descuentoCupon),
            total,
            coupon_code: coupon?.code || null,
            expires_at: order.expira_pago_at
        });

    } catch (error) {
        console.error("Checkout error:", error);
        return res.status(Number(error?.status) || 500).json({
            error: error?.message || "Ocurrió un error preparando el pago. Intentá nuevamente."
        });
    }
}
