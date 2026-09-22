import { consumeRateLimit, enforceRateLimit } from "../lib/security.js";

const GEOREF_URL = "https://apis.datos.gob.ar/georef/api/direcciones";

function clean(value, max = 180) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max);
}

function compactText(value) {
    return clean(value, 180);
}

export default async function handler(req, res) {
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido." });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "address-search",
            limit: 90,
            windowSeconds: 600
        });

        if (enforceRateLimit(
            res,
            rate,
            "Hiciste demasiadas búsquedas de dirección. Esperá un momento y probá de nuevo."
        )) return;
    } catch (error) {
        console.error("Address rate limit error:", error?.message || error);
        return res.status(503).json({ suggestions: [], unavailable: true });
    }

    const q = clean(req.query?.q, 120);
    const provincia = clean(req.query?.provincia, 80);

    if (q.length < 4) {
        return res.status(200).json({ suggestions: [] });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
        const url = new URL(GEOREF_URL);
        url.searchParams.set("direccion", q);
        url.searchParams.set("max", "6");
        if (provincia) {
            url.searchParams.set("provincia", provincia);
        }

        const response = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "DORADO-ART-PESCA/1.0"
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`GEOREF_${response.status}`);
        }

        const data = await response.json();
        const raw = Array.isArray(data?.direcciones) ? data.direcciones : [];

        const suggestions = raw.map((item, index) => {
            const street = compactText(item?.calle?.nombre);
            const number = compactText(item?.altura?.valor);
            const city = compactText(
                item?.localidad_censal?.nombre ||
                item?.municipio?.nombre ||
                item?.departamento?.nombre
            );
            const province = compactText(item?.provincia?.nombre);
            const label = compactText(
                item?.nomenclatura ||
                [street, number, city, province].filter(Boolean).join(", ")
            );

            return {
                id: compactText(item?.calle?.id || `${index}-${street}-${number}`),
                label,
                address: [street, number].filter(Boolean).join(" ").trim() || label,
                city,
                province,
                lat: Number.isFinite(Number(item?.ubicacion?.lat))
                    ? Number(item.ubicacion.lat)
                    : null,
                lon: Number.isFinite(Number(item?.ubicacion?.lon))
                    ? Number(item.ubicacion.lon)
                    : null
            };
        }).filter(item => item.label && item.address);

        res.setHeader(
            "Cache-Control",
            "public, s-maxage=300, stale-while-revalidate=86400"
        );

        return res.status(200).json({ suggestions });
    } catch (error) {
        console.error("Address autocomplete error:", error?.message || error);
        return res.status(200).json({
            suggestions: [],
            unavailable: true
        });
    } finally {
        clearTimeout(timeout);
    }
}
