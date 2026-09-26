import { fetchWithTimeout } from "../lib/security.js";

async function sb(path) {
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error("Configuración incompleta");
    return fetchWithTimeout(`${url}${path}`, {
        headers: { apikey: service, Authorization: `Bearer ${service}`, Accept: "application/json" }
    }, 8000);
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }
    try {
        const ordersResponse = await sb("/rest/v1/pedidos?estado=eq.pagado&select=id&order=created_at.desc&limit=500");
        const orders = await ordersResponse.json().catch(() => []);
        if (!ordersResponse.ok || !Array.isArray(orders) || !orders.length) return res.status(200).json({ ids: [] });

        const ids = orders.map(order => String(order.id || "")).filter(Boolean);
        const filter = ids.join(",");
        const itemsResponse = await sb(`/rest/v1/pedido_items?pedido_id=in.(${encodeURIComponent(filter).replaceAll("%2C",",")})&select=producto_id,cantidad&limit=5000`);
        const items = await itemsResponse.json().catch(() => []);
        if (!itemsResponse.ok || !Array.isArray(items)) return res.status(200).json({ ids: [] });

        const totals = new Map();
        for (const item of items) {
            const id = String(item.producto_id || "");
            if (!id) continue;
            totals.set(id, (totals.get(id) || 0) + Math.max(0, Number(item.cantidad) || 0));
        }
        const top = [...totals.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id])=>id);
        return res.status(200).json({ ids: top });
    } catch (error) {
        console.error("Best sellers error:", error?.message || error);
        return res.status(200).json({ ids: [] });
    }
}
