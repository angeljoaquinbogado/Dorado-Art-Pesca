import { consumeRateLimit, enforceRateLimit, bodyTooLarge, fetchWithTimeout } from "../lib/security.js";
import { productPrice, normalizeCouponCode, couponStatus, roundMoney } from "../lib/pricing.js";

const MAX_ITEMS = 40;
const MAX_QTY = 99;

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

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }
    if (bodyTooLarge(req, 32 * 1024)) {
        return res.status(413).json({ error: "La solicitud es demasiado grande." });
    }

    try {
        const rate = await consumeRateLimit(req, { scope: "coupon", limit: 30, windowSeconds: 600 });
        if (enforceRateLimit(res, rate, "Demasiados intentos de cupón. Esperá unos minutos.")) return;

        const code = normalizeCouponCode(req.body?.code);
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (!code) return res.status(400).json({ error: "Ingresá un cupón válido." });
        if (items.length < 1 || items.length > MAX_ITEMS) return res.status(400).json({ error: "El carrito no es válido." });

        const quantities = new Map();
        for (const item of items) {
            const id = String(item?.id ?? "").trim();
            const qty = Math.floor(Number(item?.cantidad) || 0);
            if (!id || qty < 1 || qty > MAX_QTY) return res.status(400).json({ error: "El carrito no es válido." });
            const totalQty = (quantities.get(id) || 0) + qty;
            if (totalQty > MAX_QTY) return res.status(400).json({ error: "El carrito no es válido." });
            quantities.set(id, totalQty);
        }

        const catalogResponse = await supabaseFetch("/rest/v1/productos?select=id,precio,descuento_porcentaje,activo&activo=eq.true");
        const catalog = await catalogResponse.json().catch(() => []);
        if (!catalogResponse.ok || !Array.isArray(catalog)) {
            return res.status(502).json({ error: "No pudimos validar el catálogo." });
        }

        const map = new Map(catalog.map(p => [String(p.id), p]));
        let subtotal = 0;
        for (const [id, qty] of quantities) {
            const product = map.get(id);
            if (!product) return res.status(409).json({ error: "Uno de los productos ya no está disponible." });
            subtotal += productPrice(product).final * qty;
        }
        subtotal = roundMoney(subtotal);

        const couponResponse = await supabaseFetch(`/rest/v1/cupones?codigo=eq.${encodeURIComponent(code)}&select=id,codigo,tipo,valor,minimo_compra,activo,vigente_desde,vigente_hasta,limite_usos,usos&limit=1`);
        const coupons = await couponResponse.json().catch(() => []);
        if (!couponResponse.ok || !Array.isArray(coupons)) {
            return res.status(502).json({ error: "No pudimos validar el cupón." });
        }

        const result = couponStatus(coupons[0], subtotal);
        if (!result.valid) return res.status(400).json({ error: result.reason });

        return res.status(200).json({
            code,
            subtotal,
            discount: result.discount,
            total: result.total,
            message: `Cupón ${code} aplicado.`
        });
    } catch (error) {
        console.error("Coupon API error:", error);
        return res.status(500).json({ error: "No pudimos validar el cupón." });
    }
}
