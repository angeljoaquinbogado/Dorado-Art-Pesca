export default function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");
    res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=1800");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
        return res.status(500).json({ error: "Configuración incompleta" });
    }

    const mercadoPagoEnabled = String(process.env.MERCADOPAGO_ENABLED || "").toLowerCase() === "true";
    const mercadoPagoPublicKey = String(process.env.MERCADOPAGO_PUBLIC_KEY || "").trim();

    // La publishable key de Supabase y la Public Key de Mercado Pago son públicas por diseño.
    // Nunca exponer SERVICE_ROLE, MP_ACCESS_TOKEN, CLIENT_SECRET ni WEBHOOK_SECRET.
    return res.status(200).json({
        supabaseUrl: url,
        supabasePublishableKey: key,
        mercadoPagoEnabled,
        mercadoPagoPublicKey,
        cardPaymentsEnabled: mercadoPagoEnabled && Boolean(mercadoPagoPublicKey),
        modoEnabled: String(process.env.MODO_ENABLED || "").toLowerCase() === "true",
        bankTransfer: {
            // Datos públicos confirmados por Dorado el 28/09/2026.
            // Se mantienen como valores del sitio para evitar que una variable antigua de Vercel muestre datos desactualizados.
            alias: "dorado.art.pesca",
            cbu: "0000003100061983343074",
            holder: "Maximiliano Adrian Villarino",
            taxId: "20-25635728-4",
            bank: "Mercado Pago · Cuenta en pesos"
        }
    });
}
