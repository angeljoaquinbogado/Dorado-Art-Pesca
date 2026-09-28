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
            // Datos públicos confirmados del comercio. Las variables de entorno pueden reemplazarlos sin tocar el código.
            alias: String(process.env.BANK_TRANSFER_ALIAS || "dorado.art.pesca.").trim(),
            cbu: String(process.env.BANK_TRANSFER_CBU || "0000003100042512469656").trim(),
            holder: String(process.env.BANK_TRANSFER_HOLDER || "Guadalupe Villarino").trim(),
            taxId: String(process.env.BANK_TRANSFER_TAX_ID || "27-47728170-8").trim(),
            bank: String(process.env.BANK_TRANSFER_BANK || "Mercado Pago").trim()
        }
    });
}
