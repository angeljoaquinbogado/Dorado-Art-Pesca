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

    const mercadoPagoEnvEnabled = String(process.env.MERCADOPAGO_ENABLED || "").toLowerCase() === "true";
    const mercadoPagoPublicKey = String(process.env.MERCADOPAGO_PUBLIC_KEY || "").trim();

    const defaults = {
        default_theme:"light",
        store_name:"Dorado Artículos de Pesca",
        whatsapp_phone:"5491168070039",
        phone_display:"+54 9 11 6807-0039",
        address_line:"Las Heras 1680",
        address_area:"Carupá, San Fernando",
        address_province:"Buenos Aires",
        postal_code:"B1646",
        maps_url:"https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8",
        legal_holder:"Maximiliano Adrian Villarino",
        tax_id:"20-25635728-4",
        default_stock_control:false,
        checkout_whatsapp_enabled:true,
        checkout_transfer_enabled:true,
        checkout_cash_enabled:true,
        checkout_mp_enabled:true,
        checkout_card_enabled:true,
        business_hours:{
            mon_fri:[["09:00","13:00"],["16:00","20:00"]],
            sat:[["09:00","20:00"]],
            sun:[]
        }
    };

    let settings = { ...defaults };

    try {
        const select = [
            "default_theme","store_name","whatsapp_phone","phone_display","address_line",
            "address_area","address_province","postal_code","maps_url","legal_holder","tax_id",
            "default_stock_control","checkout_whatsapp_enabled","checkout_transfer_enabled",
            "checkout_cash_enabled","checkout_mp_enabled","checkout_card_enabled","business_hours"
        ].join(",");

        const response = await fetch(
            url + "/rest/v1/site_settings?id=eq.1&select=" + encodeURIComponent(select),
            {
                headers: {
                    apikey: key,
                    Authorization: "Bearer " + key,
                    Accept: "application/json"
                }
            }
        );
        const rows = await response.json().catch(() => []);
        if (response.ok && rows && rows[0]) {
            settings = { ...settings, ...rows[0] };
        }
    } catch {}

    const rawTheme = String(settings.default_theme || "").toLowerCase();
    const siteThemeDefault = ["default","light","dark"].includes(rawTheme) ? rawTheme : "light";

    const checkoutVisibility = {
        whatsapp: settings.checkout_whatsapp_enabled !== false,
        transfer: settings.checkout_transfer_enabled !== false,
        cash: settings.checkout_cash_enabled !== false,
        mercadoPago: settings.checkout_mp_enabled !== false,
        card: settings.checkout_card_enabled !== false
    };

    const checkoutAvailability = {
        whatsapp: checkoutVisibility.whatsapp,
        transfer: checkoutVisibility.transfer,
        cash: checkoutVisibility.cash,
        mercadoPago: checkoutVisibility.mercadoPago && mercadoPagoEnvEnabled,
        card: checkoutVisibility.card && mercadoPagoEnvEnabled && Boolean(mercadoPagoPublicKey)
    };

    return res.status(200).json({
        supabaseUrl: url,
        supabasePublishableKey: key,
        siteThemeDefault,
        mercadoPagoEnabled: checkoutAvailability.mercadoPago,
        mercadoPagoPublicKey,
        cardPaymentsEnabled: checkoutAvailability.card,
        checkoutVisibility,
        checkoutAvailability,
        defaultStockControl: Boolean(settings.default_stock_control),
        business: {
            name: String(settings.store_name || defaults.store_name),
            whatsapp: String(settings.whatsapp_phone || defaults.whatsapp_phone).replace(/\D/g,""),
            phoneDisplay: String(settings.phone_display || defaults.phone_display),
            address: String(settings.address_line || defaults.address_line),
            area: String(settings.address_area || defaults.address_area),
            province: String(settings.address_province || defaults.address_province),
            postalCode: String(settings.postal_code || defaults.postal_code),
            mapsUrl: String(settings.maps_url || defaults.maps_url),
            legalHolder: String(settings.legal_holder || defaults.legal_holder),
            taxId: String(settings.tax_id || defaults.tax_id),
            hours: settings.business_hours && typeof settings.business_hours === "object"
                ? settings.business_hours
                : defaults.business_hours
        },
        bankTransfer: {
            alias: "dorado.art.pesca",
            cbu: "0000003100061983343074",
            holder: String(settings.legal_holder || defaults.legal_holder),
            taxId: String(settings.tax_id || defaults.tax_id),
            bank: "Mercado Pago · Cuenta en pesos"
        }
    });
}