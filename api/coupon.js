import { consumeRateLimit, enforceRateLimit, bodyTooLarge, fetchWithTimeout } from "../lib/security.js";

const MAX_ITEMS = 40;
const MAX_QTY = 99;

function clean(value, max = 80) {
    return String(value ?? "").trim().slice(0, max);
}

function normalizeCode(value) {
    return clean(value, 40).toUpperCase().replace(/\s+/g, "");
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

async function supabaseFetch(path, options = {}) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error("Supabase server credentials missing");

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

async function calculateCart(itemsRaw) {
    if (!Array.isArray(itemsRaw) || itemsRaw.length < 1 || itemsRaw.length > MAX_ITEMS) {
        throw Object.assign(new Error("Carrito inválido"), { status: 400 });
    }

    const cantidades = new Map();
    for (const item of itemsRaw) {
        const id = String(item?.id ?? "").trim();
        const cantidad = Math.floor(Number(item?.cantidad) || 0);
        if (!id || cantidad < 1 || cantidad > MAX_QTY) {
            throw Object.assign(new Error("Cantidad inválida"), { status: 400 });
        }
        const acumulada = (cantidades.get(id) || 0) + cantidad;
        if (acumulada > MAX_QTY) {
            throw Object.assign(new Error("Cantidad inválida"), { status: 400 });
        }
        cantidades.set(id, acumulada);
    }

    const response = await supabaseFetch(
        "/rest/v1/productos?select=id,precio,descuento_porcentaje,stock,activo&activo=eq.true"
    );
    const rows = await response.json().catch(() => []);

    if (!response.ok || !Array.isArray(rows)) {
        throw Object.assign(new Error("No pudimos validar el catálogo"), { status: 502 });
    }

    const map = new Map(rows.map(p => [String(p.id), p]));
    let subtotal = 0;

    for (const [id, cantidad] of cantidades) {
        const producto = map.get(id);
        if (!producto?.activo) {
            throw Object.assign(new Error("Uno de los productos ya no está disponible"), { status: 409 });
        }

        const stock = Math.max(0, Number(producto.stock) || 0);
        if (cantidad > stock) {
            throw Object.assign(new Error("Uno de los productos ya no tiene el stock solicitado"), { status: 409 });
        }

        const base = Math.max(0, Number(producto.precio) || 0);
        const discount = Math.min(95, Math.max(0, Number(producto.descuento_porcentaje) || 0));
        const finalPrice = roundMoney(base * (1 - discount / 100));

        if (finalPrice <= 0) {
            throw Object.assign(new Error("Uno de los productos tiene un precio inválido"), { status: 409 });
        }

        subtotal += finalPrice * cantidad;
    }

    return roundMoney(subtotal);
}

async function validateCoupon(codeRaw, subtotal) {
    const code = normalizeCode(codeRaw);
    if (!code) {
        throw Object.assign(new Error("Ingresá un cupón"), { status: 400 });
    }

    const response = await supabaseFetch(
        `/rest/v1/cupones?codigo=eq.${encodeURIComponent(code)}&select=id,codigo,tipo,valor,minimo_compra,activo,valido_desde,valido_hasta&limit=1`
    );
    const rows = await response.json().catch(() => []);

    if (!response.ok || !Array.isArray(rows)) {
        throw Object.assign(new Error("No pudimos validar el cupón"), { status: 502 });
    }

    const coupon = rows[0];
    if (!coupon || !coupon.activo) {
        throw Object.assign(new Error("El cupón no existe o no está activo"), { status: 404 });
    }

    const now = Date.now();
    if (coupon.valido_desde && new Date(coupon.valido_desde).getTime() > now) {
        throw Object.assign(new Error("Este cupón todavía no está vigente"), { status: 409 });
    }
    if (coupon.valido_hasta && new Date(coupon.valido_hasta).getTime() < now) {
        throw Object.assign(new Error("Este cupón ya venció"), { status: 409 });
    }

    const minimum = Math.max(0, Number(coupon.minimo_compra) || 0);
    if (subtotal + 0.001 < minimum) {
        throw Object.assign(new Error(`Este cupón requiere una compra mínima de $${Math.round(minimum).toLocaleString("es-AR")}`), { status: 409 });
    }

    const value = Math.max(0, Number(coupon.valor) || 0);
    const discount = coupon.tipo === "fijo"
        ? Math.min(subtotal, value)
        : Math.min(subtotal, subtotal * Math.min(100, value) / 100);

    return {
        id: coupon.id,
        code: normalizeCode(coupon.codigo),
        type: coupon.tipo,
        value,
        discount: roundMoney(discount)
    };
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }

    if (bodyTooLarge(req, 24 * 1024)) {
        return res.status(413).json({ error: "Solicitud demasiado grande" });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "coupon",
            limit: 30,
            windowSeconds: 600
        });
        if (enforceRateLimit(res, rate, "Demasiados intentos de cupón. Esperá unos minutos.")) return;

        const body = req.body && typeof req.body === "object" ? req.body : {};
        const subtotal = await calculateCart(body.items);
        const coupon = await validateCoupon(body.code, subtotal);
        const total = roundMoney(Math.max(0, subtotal - coupon.discount));

        return res.status(200).json({
            valid: true,
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            subtotal,
            discount: coupon.discount,
            total
        });
    } catch (error) {
        return res.status(Number(error?.status) || 500).json({
            error: error?.message || "No pudimos validar el cupón"
        });
    }
}
