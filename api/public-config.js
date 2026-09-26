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
            alias: String(process.env.BANK_TRANSFER_ALIAS || "").trim(),
            cbu: String(process.env.BANK_TRANSFER_CBU || "").trim(),
            holder: String(process.env.BANK_TRANSFER_HOLDER || "").trim(),
            bank: String(process.env.BANK_TRANSFER_BANK || "").trim()
        }
    });
}
