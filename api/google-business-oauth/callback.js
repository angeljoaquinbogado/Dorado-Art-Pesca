import { createHmac, timingSafeEqual } from "node:crypto";
import {
    discoverGoogleBusinessLocation,
    exchangeGoogleBusinessCode,
    loadGoogleBusinessConnection,
    saveGoogleBusinessConnection,
    syncGoogleBusinessReviews
} from "../../lib/google-business.js";

function cookieValue(req, name) {
    const raw = String(req?.headers?.cookie || "");
    const parts = raw.split(";").map(part => part.trim());
    for (const part of parts) {
        const index = part.indexOf("=");
        if (index < 0) continue;
        const key = part.slice(0, index).trim();
        if (key === name) return decodeURIComponent(part.slice(index + 1));
    }
    return "";
}

function verifyState(state, secret, expectedNonce) {
    const [encoded, received] = String(state || "").split(".", 2);
    if (!encoded || !received || !secret) return null;

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

function finish(res, params) {
    const search = new URLSearchParams(params);
    res.setHeader(
        "Set-Cookie",
        "dorado_gbp_oauth=; Path=/api/google-business-oauth; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
    );
    return res.redirect(302, `/admin.html?${search.toString()}`);
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).send("Método no permitido");
    }

    const googleError = String(req.query?.error || "").trim();
    if (googleError) {
        return finish(res, {
            google_business: "error",
            reason: googleError === "access_denied" ? "permiso_cancelado" : "oauth_google"
        });
    }

    const code = String(req.query?.code || "").trim();
    const state = String(req.query?.state || "").trim();
    const nonce = cookieValue(req, "dorado_gbp_oauth");
    const stateSecret = String(process.env.RATE_LIMIT_SECRET || "").trim();

    if (!code || !verifyState(state, stateSecret, nonce)) {
        return finish(res, {
            google_business: "error",
            reason: "estado_invalido"
        });
    }

    try {
        const tokenData = await exchangeGoogleBusinessCode(code);

        let refreshToken = String(tokenData?.refresh_token || "").trim();
        if (!refreshToken) {
            const existing = await loadGoogleBusinessConnection().catch(() => null);
            refreshToken = String(existing?.refresh_token || "").trim();
        }

        if (!refreshToken) {
            throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
        }

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
            syncStatus = syncError?.status === 403
                ? "necesita_acceso_api"
                : "error_sincronizacion";
        }

        return finish(res, {
            google_business: "connected",
            sync: syncStatus,
            reviews: String(reviewCount)
        });
    } catch (error) {
        console.error("Google Business OAuth callback error:", error?.message || error);

        const reason = String(error?.message || "").includes("NO_ACCOUNTS")
            ? "sin_cuentas"
            : String(error?.message || "").includes("NO_LOCATIONS")
                ? "sin_ubicaciones"
                : "conexion";

        return finish(res, {
            google_business: "error",
            reason
        });
    }
}
