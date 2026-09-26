import {
    bodyTooLarge,
    consumeRateLimit,
    enforceRateLimit,
    fetchWithTimeout,
    sameOriginRequest
} from "../lib/security.js";

const COOKIE_NAME = "dorado_admin_refresh";
const MAX_EMAIL = 160;
const MAX_PASSWORD = 512;

function clean(value, max) {
    return String(value ?? "").trim().slice(0, max);
}

function parseCookies(req) {
    const raw = String(req.headers.cookie || "");
    const out = new Map();

    for (const part of raw.split(";")) {
        const index = part.indexOf("=");
        if (index < 1) continue;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (!key) continue;
        try {
            out.set(key, decodeURIComponent(value));
        } catch {
            out.set(key, value);
        }
    }

    return out;
}

function cookieHeader(req, value, maxAge) {
    const proto = String(req.headers["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim()
        .toLowerCase();
    const secure = proto === "https" || process.env.NODE_ENV === "production";
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(value)}`,
        "Path=/api/admin-auth",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
        "Priority=High"
    ];
    if (secure) parts.push("Secure");
    return parts.join("; ");
}

function clearCookie(req) {
    return cookieHeader(req, "", 0);
}

function config() {
    const url = String(process.env.SUPABASE_URL || "").trim();
    const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || "").trim();
    if (!url || !key) throw new Error("AUTH_CONFIG_MISSING");
    return { url: url.replace(/\/$/, ""), key };
}

async function tokenRequest(url, key, grantType, body) {
    return fetchWithTimeout(
        `${url}/auth/v1/token?grant_type=${encodeURIComponent(grantType)}`,
        {
            method: "POST",
            headers: {
                apikey: key,
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(body)
        },
        8000
    );
}

async function isAdmin(url, key, accessToken, userId) {
    if (!accessToken || !userId) return false;

    const response = await fetchWithTimeout(
        `${url}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`,
        {
            headers: {
                apikey: key,
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            }
        },
        8000
    );

    const rows = await response.json().catch(() => []);
    return response.ok && Array.isArray(rows) && rows.length === 1;
}

function publicSession(data) {
    return {
        access_token: String(data?.access_token || ""),
        expires_in: Math.max(60, Number(data?.expires_in) || 3600),
        user: {
            id: String(data?.user?.id || ""),
            email: String(data?.user?.email || "")
        }
    };
}

async function revokeAccessToken(url, key, accessToken) {
    if (!accessToken) return;
    await fetchWithTimeout(
        `${url}/auth/v1/logout`,
        {
            method: "POST",
            headers: {
                apikey: key,
                Authorization: `Bearer ${accessToken}`
            }
        },
        5000
    ).catch(() => null);
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }

    if (!sameOriginRequest(req)) {
        return res.status(403).json({ error: "Origen no autorizado" });
    }

    if (bodyTooLarge(req, 8 * 1024)) {
        return res.status(413).json({ error: "Solicitud demasiado grande" });
    }

    const action = clean(req.body?.action, 20).toLowerCase();

    try {
        const { url, key } = config();

        if (action === "login") {
            const email = clean(req.body?.email, MAX_EMAIL).toLowerCase();
            const password = String(req.body?.password ?? "").slice(0, MAX_PASSWORD);

            if (!email || !password) {
                return res.status(401).json({ error: "No se pudo iniciar sesión." });
            }

            const rate = await consumeRateLimit(req, {
                scope: "admin-login",
                limit: 8,
                windowSeconds: 900,
                subject: email
            });
            if (enforceRateLimit(
                res,
                rate,
                "Demasiados intentos de acceso. Esperá unos minutos y volvé a intentar."
            )) return;

            const response = await tokenRequest(url, key, "password", { email, password });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data?.access_token || !data?.refresh_token || !data?.user?.id) {
                return res.status(401).json({ error: "Email o contraseña incorrectos." });
            }

            if (!await isAdmin(url, key, data.access_token, data.user.id)) {
                await revokeAccessToken(url, key, data.access_token);
                return res.status(401).json({ error: "Email o contraseña incorrectos." });
            }

            const maxAge = Math.max(300, Number(data?.expires_in) || 3600) * 24;
            res.setHeader("Set-Cookie", cookieHeader(req, data.refresh_token, maxAge));
            return res.status(200).json(publicSession(data));
        }

        if (action === "refresh") {
            const refreshToken = parseCookies(req).get(COOKIE_NAME) || "";
            if (!refreshToken) {
                res.setHeader("Set-Cookie", clearCookie(req));
                return res.status(401).json({ error: "Sesión no iniciada." });
            }

            const rate = await consumeRateLimit(req, {
                scope: "admin-refresh",
                limit: 120,
                windowSeconds: 900
            });
            if (enforceRateLimit(res, rate, "Demasiadas solicitudes de sesión.")) return;

            const response = await tokenRequest(url, key, "refresh_token", {
                refresh_token: refreshToken
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data?.access_token || !data?.refresh_token || !data?.user?.id) {
                res.setHeader("Set-Cookie", clearCookie(req));
                return res.status(401).json({ error: "La sesión venció." });
            }

            if (!await isAdmin(url, key, data.access_token, data.user.id)) {
                await revokeAccessToken(url, key, data.access_token);
                res.setHeader("Set-Cookie", clearCookie(req));
                return res.status(401).json({ error: "La sesión venció." });
            }

            const maxAge = Math.max(300, Number(data?.expires_in) || 3600) * 24;
            res.setHeader("Set-Cookie", cookieHeader(req, data.refresh_token, maxAge));
            return res.status(200).json(publicSession(data));
        }

        if (action === "logout") {
            const authorization = String(req.headers.authorization || "").trim();
            const accessToken = authorization.startsWith("Bearer ")
                ? authorization.slice(7).trim()
                : "";

            res.setHeader("Set-Cookie", clearCookie(req));
            await revokeAccessToken(url, key, accessToken);
            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ error: "Acción inválida." });
    } catch (error) {
        console.error("Admin auth error:", error?.message || "unknown");
        return res.status(500).json({ error: "No se pudo validar la sesión." });
    }
}
