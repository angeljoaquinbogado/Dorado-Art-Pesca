export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");

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

    let siteThemeDefault = "light";
    try {
        const response = await fetch(
            `${url}/rest/v1/site_settings?id=eq.1&select=default_theme`,
            {
                headers: {
                    apikey: key,
                    Accept: "application/json"
                }
            }
        );
        const rows = await response.json().catch(() => []);
        const value = String(rows?.[0]?.default_theme || "light").toLowerCase();
        if (response.ok && ["default","light","dark"].includes(value)) {
            siteThemeDefault = value;
        }
    } catch {
        siteThemeDefault = "light";
    }

    // La publishable key de Supabase y la Public Key de Mercado Pago son públicas por diseño.
    // Nunca exponer SERVICE_ROLE, MP_ACCESS_TOKEN, CLIENT_SECRET ni WEBHOOK_SECRET.
    return res.status(200).json({
        supabaseUrl: url,
        supabasePublishableKey: key,
        siteThemeDefault,
        mercadoPagoEnabled,
        mercadoPagoPublicKey,
        cardPaymentsEnabled: mercadoPagoEnabled && Boolean(mercadoPagoPublicKey),
        modoEnabled: String(process.env.MODO_ENABLED || "").toLowerCase() === "true",
        bankTransfer: {
            alias: "dorado.art.pesca",
            cbu: "0000003100061983343074",
            holder: "Maximiliano Adrian Villarino",
            taxId: "20-25635728-4",
            bank: "Mercado Pago · Cuenta en pesos"
        }
    });
}
