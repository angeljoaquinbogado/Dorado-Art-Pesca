import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireAdmin } from "../lib/admin-auth.js";
import {
  DORADO_MAPS_URL,
  discoverGoogleBusinessLocation,
  exchangeGoogleBusinessCode,
  googleBusinessOAuthConfig,
  loadGoogleBusinessConnection,
  saveGoogleBusinessConnection,
  syncGoogleBusinessReviews
} from "../lib/google-business.js";
import { fetchWithTimeout, isSameOriginRequest } from "../lib/security.js";

const MAPS_URL = DORADO_MAPS_URL;

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

function signState(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function cookieValue(req, name) {
  const raw = String(req?.headers?.cookie || "");
  const parts = raw.split(";").map(part => part.trim());
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1));
    }
  }
  return "";
}

function verifyState(state, secret, expectedNonce) {
  const [encoded, received] = String(state || "").split(".", 2);
  if (!encoded || !received || !secret || !expectedNonce) return null;

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const left = Buffer.from(received);
  const right = Buffer.from(expected);

  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload?.nonce || payload.nonce !== expectedNonce) return null;
  if (!Number.isFinite(Number(payload?.exp)) || Number(payload.exp) < Date.now()) return null;
  return payload;
}

function finishOAuth(res, params) {
  const search = new URLSearchParams(params);
  res.setHeader(
    "Set-Cookie",
    "dorado_gbp_oauth=; Path=/api/google-business-oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
  );
  return res.redirect(302, `https://www.doradoarticulosdepesca.com.ar/admin.html?${search.toString()}`);
}

async function startGoogleOAuth(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (!isSameOriginRequest(req)) {
    return res.status(403).json({ error: "Origen no autorizado." });
  }

  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return res.status(admin.status).json({ error: admin.error });
  }

  try {
    const { clientId, redirectUri } = googleBusinessOAuthConfig();
    const stateSecret = String(process.env.RATE_LIMIT_SECRET || "").trim();
    if (!stateSecret) {
      return res.status(500).json({ error: "Falta configurar la seguridad del servidor." });
    }

    const nonce = randomBytes(24).toString("base64url");
    const state = signState({
      uid: String(admin.user.id),
      nonce,
      exp: Date.now() + 10 * 60 * 1000
    }, stateSecret);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/business.manage",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state
    });

    res.setHeader(
      "Set-Cookie",
      `dorado_gbp_oauth=${nonce}; Path=/api/google-business-oauth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
    );

    return res.status(200).json({
      ok: true,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    });
  } catch (error) {
    console.error("Google Business OAuth start error:", error?.message || error);
    return res.status(500).json({ error: "No se pudo iniciar la conexión con Google." });
  }
}

async function finishGoogleOAuth(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Método no permitido");
  }

  const googleError = String(req.query?.error || "").trim();
  if (googleError) {
    return finishOAuth(res, {
      google_business: "error",
      reason: googleError === "access_denied" ? "permiso_cancelado" : "oauth_google"
    });
  }

  const code = String(req.query?.code || "").trim();
  const state = String(req.query?.state || "").trim();
  const nonce = cookieValue(req, "dorado_gbp_oauth");
  const stateSecret = String(process.env.RATE_LIMIT_SECRET || "").trim();

  if (!code || !verifyState(state, stateSecret, nonce)) {
    return finishOAuth(res, { google_business: "error", reason: "estado_invalido" });
  }

  try {
    const tokenData = await exchangeGoogleBusinessCode(code);

    let refreshToken = String(tokenData?.refresh_token || "").trim();
    if (!refreshToken) {
      const existing = await loadGoogleBusinessConnection().catch(() => null);
      refreshToken = String(existing?.refresh_token || "").trim();
    }
    if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");

    const location = await discoverGoogleBusinessLocation(tokenData.access_token);

    await saveGoogleBusinessConnection({
      refreshToken,
      accountName: location.accountName,
      locationName: location.locationName,
      locationTitle: location.locationTitle
    });

    let syncStatus = "ok";
    let reviewCount = 0;

    try {
      const sync = await syncGoogleBusinessReviews({
        accessToken: tokenData.access_token,
        connection: {
          refresh_token: refreshToken,
          account_name: location.accountName,
          location_name: location.locationName,
          location_title: location.locationTitle
        }
      });
      reviewCount = Number(sync?.total) || 0;
    } catch (syncError) {
      console.error("Google Business initial review sync failed:", syncError?.message || syncError);
      syncStatus = syncError?.status === 403 ? "necesita_acceso_api" : "error_sincronizacion";
    }

    return finishOAuth(res, {
      google_business: "connected",
      sync: syncStatus,
      reviews: String(reviewCount)
    });
  } catch (error) {
    console.error("Google Business OAuth callback error:", error?.message || error);
    const message = String(error?.message || "");
    const reason = message.includes("NO_ACCOUNTS")
      ? "sin_cuentas"
      : message.includes("NO_LOCATIONS")
        ? "sin_ubicaciones"
        : "conexion";

    return finishOAuth(res, { google_business: "error", reason });
  }
}

async function publicReviews(req, res) {
  res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  res.setHeader("CDN-Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  try {
    const response = await sb("/rest/v1/resenas_google?activa=eq.true&select=id,external_id,autor,avatar_url,calificacion,comentario,fecha_resena,fecha_texto,fuente_url&order=id.asc&limit=100");
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows)) {
      return res.status(200).json({ reviews: [], maps_url: MAPS_URL });
    }

    const reviews = rows.map(row => ({
      id: String(row.external_id || row.id || ""),
      autor: String(row.autor || "Cliente").slice(0, 120),
      avatar_url: safeHttpsUrl(row.avatar_url),
      calificacion: Math.max(1, Math.min(5, Number(row.calificacion) || 1)),
      comentario: String(row.comentario || "").slice(0, 1600),
      fecha_resena: row.fecha_resena || null,
      fecha_texto: String(row.fecha_texto || "").slice(0, 80),
      fuente_url: safeHttpsUrl(row.fuente_url) || MAPS_URL
    }));

    const total = reviews.length;
    const average = total
      ? Math.round((reviews.reduce((sum, item) => sum + item.calificacion, 0) / total) * 10) / 10
      : null;

    return res.status(200).json({
      reviews,
      maps_url: MAPS_URL,
      summary: { total, average }
    });
  } catch (error) {
    console.error("Reviews endpoint error:", error?.message || error);
    return res.status(200).json({ reviews: [], maps_url: MAPS_URL });
  }
}

export default async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  const action = String(req.query?.action || "").trim();
  if (action === "google_oauth_start") return startGoogleOAuth(req, res);
  if (action === "google_oauth_callback") return finishGoogleOAuth(req, res);
  return publicReviews(req, res);
}
