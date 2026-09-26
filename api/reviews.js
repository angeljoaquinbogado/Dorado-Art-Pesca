import { fetchWithTimeout } from "../lib/security.js";

const MAPS_URL = "https://maps.app.goo.gl/TwX97iRfzjRwDdy38";

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

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
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const response = await sb("/rest/v1/resenas_google?activa=eq.true&select=id,external_id,autor,avatar_url,calificacion,comentario,fecha_resena,fuente_url&order=calificacion.desc,fecha_resena.desc&limit=100");
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows)) return res.status(200).json({ reviews: [], maps_url: MAPS_URL });

    const reviews = rows.map(row => ({
      id: String(row.external_id || row.id || ""),
      autor: String(row.autor || "Cliente").slice(0, 120),
      avatar_url: safeHttpsUrl(row.avatar_url),
      calificacion: Math.max(1, Math.min(5, Number(row.calificacion) || 1)),
      comentario: String(row.comentario || "").slice(0, 1600),
      fecha_resena: row.fecha_resena || null,
      fuente_url: safeHttpsUrl(row.fuente_url) || MAPS_URL
    }));
    return res.status(200).json({ reviews, maps_url: MAPS_URL });
  } catch (error) {
    console.error("Reviews endpoint error:", error?.message || error);
    return res.status(200).json({ reviews: [], maps_url: MAPS_URL });
  }
}
