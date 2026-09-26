export default function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
        return res.status(500).json({ error: "Configuración incompleta" });
    }

    // La publishable key es pública por diseño. Nunca exponer SERVICE_ROLE ni MP_ACCESS_TOKEN.
    return res.status(200).json({
        supabaseUrl: url,
        supabasePublishableKey: key,
        mercadoPagoEnabled: String(process.env.MERCADOPAGO_ENABLED || "").toLowerCase() === "true",
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
