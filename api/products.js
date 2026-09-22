export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
        return res.status(500).json({ error: "Configuración incompleta del servidor" });
    }

    try {
        const pageSize = 1000;
        const rows = [];

        for (let page = 0; page < 50; page += 1) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            const response = await fetch(
                `${url}/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,imagen,imagenes,categoria,stock,activo&activo=eq.true&order=id.asc`,
                {
                    headers: {
                        apikey: key,
                        Authorization: `Bearer ${key}`,
                        Accept: "application/json",
                        Range: `${from}-${to}`,
                        "Range-Unit": "items"
                    }
                }
            );

            const data = await response.json().catch(() => []);
            if (!response.ok || !Array.isArray(data)) {
                console.error("Supabase products error:", data);
                return res.status(502).json({ error: "No se pudieron cargar los productos" });
            }

            rows.push(...data);
            if (data.length < pageSize) break;
        }

        const safe = rows.map(p => ({
            id: p.id,
            nombre: String(p.nombre || ""),
            descripcion: String(p.descripcion || ""),
            caracteristicas: String(p.caracteristicas || ""),
            precio: Math.max(0, Number(p.precio) || 0),
            imagen: String(p.imagen || ""),
            imagenes: Array.isArray(p.imagenes)
                ? p.imagenes.map(x => String(x || "").trim()).filter(Boolean)
                : [],
            categoria: String(p.categoria || ""),
            stock: Math.max(0, Number(p.stock) || 0),
            activo: Boolean(p.activo)
        }));

        return res.status(200).json(safe);

    } catch (error) {
        console.error("Products API error:", error);
        return res.status(500).json({ error: "Error conectando con el catálogo" });
    }
}
