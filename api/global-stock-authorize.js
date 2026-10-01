import crypto from "node:crypto";
import nodemailer from "nodemailer";

import { requireAdmin } from "../lib/admin-auth.js";
import {
    bodyTooLarge,
    consumeRateLimit,
    enforceRateLimit,
    fetchWithTimeout,
    isSameOriginRequest,
    requireJsonRequest
} from "../lib/security.js";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const GRANT_TTL_MS = 2 * 60 * 1000;

function serviceHeaders(key) {
    return {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json"
    };
}

async function parseJson(response, fallback = null) {
    try {
        return await response.json();
    } catch {
        return fallback;
    }
}

function hashToken(value) {
    return crypto
        .createHash("sha256")
        .update(String(value || ""))
        .digest("hex");
}

function hashOtp(code, salt) {
    return crypto
        .scryptSync(String(code), String(salt), 32)
        .toString("hex");
}

function safeHexEqual(left, right) {
    try {
        const a = Buffer.from(String(left || ""), "hex");
        const b = Buffer.from(String(right || ""), "hex");
        return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

function maskEmail(value) {
    const email = String(value || "").trim();
    const [name, domain] = email.split("@");
    if (!name || !domain) return "tu correo administrador";
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${"*".repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

function allowedGlobalStockOrigin(raw) {
    const configured = [
        process.env.GLOBAL_STOCK_APP_ORIGIN,
        ...(String(process.env.GLOBAL_STOCK_ALLOWED_ORIGINS || "")
            .split(",")
            .map(value => value.trim())
            .filter(Boolean)),
        "https://globalstocks.vercel.app",
        "https://global-stock-angel-6b19.vercel.app"
    ];

    const allowed = new Set();
    for (const candidate of configured) {
        if (!candidate) continue;
        try {
            const url = new URL(candidate);
            if (url.protocol === "https:") allowed.add(url.origin);
        } catch {}
    }

    try {
        const target = new URL(String(raw || ""));
        return allowed.has(target.origin) ? target.origin : "";
    } catch {
        return "";
    }
}

async function sendOtpEmail(email, code) {
    const user = String(process.env.GMAIL_USER || "").trim();
    const pass = String(process.env.GMAIL_APP_PASSWORD || "").trim();

    if (!user || !pass) {
        throw new Error("EMAIL_NOT_CONFIGURED");
    }

    const transport = nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass }
    });

    await transport.sendMail({
        from: `"Dorado Artículos de Pesca" <${user}>`,
        to: email,
        replyTo: String(process.env.EMAIL_REPLY_TO || user).trim() || user,
        subject: "Código para autorizar Global Stock",
        text:
            `Tu código para conectar Global Stock con Dorado es ${code}.\n\n` +
            "Vence en 10 minutos y puede usarse una sola vez. " +
            "Si no solicitaste esta conexión, ignorá este mensaje.",
        html:
            '<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px">' +
            '<p style="font-size:12px;letter-spacing:.16em;color:#8f0000;font-weight:700">DORADO · GLOBAL STOCK</p>' +
            '<h2 style="margin:8px 0 12px">Código de verificación</h2>' +
            '<p style="color:#555;line-height:1.6">Usá este código para confirmar que administrás Dorado y autorizar la conexión con Global Stock.</p>' +
            `<div style="font-size:34px;letter-spacing:.28em;font-weight:800;padding:20px 0">${code}</div>` +
            '<p style="color:#777;font-size:13px;line-height:1.6">Vence en 10 minutos y puede usarse una sola vez. Si no solicitaste esta conexión, ignorá este correo.</p>' +
            "</div>"
    });
}

async function serviceRequest(url, serviceKey, options = {}) {
    const response = await fetchWithTimeout(
        url,
        {
            ...options,
            headers: {
                ...serviceHeaders(serviceKey),
                ...(options.headers || {})
            }
        },
        8000
    );
    const data = await parseJson(response, null);
    return { response, data };
}

async function exchangeGrant(req, res) {
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "SERVER_NOT_CONFIGURED" });
    }

    try {
        const rate = await consumeRateLimit(req, {
            scope: "global-stock-grant-exchange",
            limit: 20,
            windowSeconds: 60
        });
        if (enforceRateLimit(res, rate, "Demasiados intentos de conexión.")) return;
    } catch {
        return res.status(503).json({ error: "No se pudo validar la operación." });
    }

    const grant = String(req.body?.grant || "").trim();
    if (!/^gs_grant_[A-Za-z0-9_-]{30,120}$/.test(grant)) {
        return res.status(400).json({ error: "INVALID_GRANT" });
    }

    const grantHash = hashToken(grant);
    const base = `${supabaseUrl}/rest/v1/global_stock_authorization_grants`;
    const query =
        `${base}?grant_hash=eq.${encodeURIComponent(grantHash)}` +
        "&used_at=is.null&select=id,owner_user_id,expires_at&limit=1";

    const loaded = await serviceRequest(query, serviceKey);
    const row = Array.isArray(loaded.data) ? loaded.data[0] : null;

    if (
        !loaded.response.ok ||
        !row?.id ||
        new Date(row.expires_at).getTime() <= Date.now()
    ) {
        return res.status(401).json({ error: "GRANT_EXPIRED_OR_INVALID" });
    }

    const claim = await serviceRequest(
        `${base}?id=eq.${encodeURIComponent(row.id)}&used_at=is.null`,
        serviceKey,
        {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ used_at: new Date().toISOString() })
        }
    );
    const claimed = Array.isArray(claim.data) ? claim.data[0] : null;
    if (!claim.response.ok || !claimed?.id) {
        return res.status(409).json({ error: "GRANT_ALREADY_USED" });
    }

    const rawToken = `gs_dorado_${crypto.randomBytes(32).toString("base64url")}`;
    const tokenHash = hashToken(rawToken);
    const integrationsUrl = `${supabaseUrl}/rest/v1/global_stock_integrations`;
    const created = await serviceRequest(integrationsUrl, serviceKey, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
            owner_user_id: row.owner_user_id,
            name: "Global Stock · verificación por email",
            token_hash: tokenHash,
            token_prefix: rawToken.slice(0, 18),
            scopes: [
                "catalog:read",
                "inventory:read",
                "inventory:write",
                "orders:read"
            ]
        })
    });
    const integration = Array.isArray(created.data) ? created.data[0] : null;

    if (!created.response.ok || !integration?.id) {
        return res.status(502).json({ error: "INTEGRATION_CREATE_FAILED" });
    }

    return res.status(200).json({
        verified: true,
        token: rawToken,
        integration: {
            id: integration.id,
            scopes: integration.scopes,
            createdAt: integration.created_at
        }
    });
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return res.status(405).json({ error: "Método no permitido" });
    }

    if (!requireJsonRequest(req)) {
        return res.status(415).json({ error: "Formato de solicitud no compatible." });
    }

    if (bodyTooLarge(req, 16 * 1024)) {
        return res.status(413).json({ error: "La solicitud es demasiado grande." });
    }

    const action = String(req.body?.action || "").trim().toLowerCase();

    if (action === "exchange") {
        return exchangeGrant(req, res);
    }

    if (!isSameOriginRequest(req)) {
        return res.status(403).json({ error: "Origen no autorizado." });
    }

    const admin = await requireAdmin(req);
    if (!admin.ok) {
        return res.status(admin.status).json({ error: admin.error });
    }
    if (!admin.serviceKey) {
        return res.status(500).json({ error: "Configuración incompleta del servidor." });
    }

    const email = String(admin.user?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "La cuenta administradora no tiene un correo válido." });
    }

    if (action === "send") {
        const returnOrigin = allowedGlobalStockOrigin(req.body?.returnOrigin);
        if (!returnOrigin) {
            return res.status(400).json({ error: "Destino de Global Stock no autorizado." });
        }

        try {
            const rate = await consumeRateLimit(req, {
                scope: "global-stock-otp-send",
                limit: 3,
                windowSeconds: 600,
                subject: admin.user.id
            });
            if (enforceRateLimit(res, rate, "Pediste demasiados códigos. Esperá unos minutos.")) return;
        } catch {
            return res.status(503).json({ error: "No se pudo validar la operación." });
        }

        const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
        const salt = crypto.randomBytes(16).toString("base64url");
        const id = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
        const challengesUrl = `${admin.supabaseUrl}/rest/v1/global_stock_authorization_challenges`;

        await serviceRequest(
            `${challengesUrl}?owner_user_id=eq.${encodeURIComponent(admin.user.id)}&used_at=is.null`,
            admin.serviceKey,
            {
                method: "PATCH",
                body: JSON.stringify({ used_at: new Date().toISOString() })
            }
        );

        const inserted = await serviceRequest(challengesUrl, admin.serviceKey, {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
                id,
                owner_user_id: admin.user.id,
                email,
                code_hash: hashOtp(code, salt),
                salt,
                expires_at: expiresAt
            })
        });

        if (!inserted.response.ok) {
            return res.status(502).json({ error: "No se pudo iniciar la verificación." });
        }

        try {
            await sendOtpEmail(email, code);
        } catch (error) {
            await serviceRequest(
                `${challengesUrl}?id=eq.${encodeURIComponent(id)}`,
                admin.serviceKey,
                {
                    method: "PATCH",
                    body: JSON.stringify({ used_at: new Date().toISOString() })
                }
            );

            if (error?.message === "EMAIL_NOT_CONFIGURED") {
                return res.status(503).json({ error: "El correo de verificación todavía no está configurado en el servidor." });
            }
            console.error("Global Stock OTP mail error:", error?.message || error);
            return res.status(502).json({ error: "No se pudo enviar el código de verificación." });
        }

        return res.status(200).json({
            sent: true,
            challengeId: id,
            maskedEmail: maskEmail(email),
            expiresInSeconds: Math.floor(CHALLENGE_TTL_MS / 1000)
        });
    }

    if (action === "verify") {
        const returnOrigin = allowedGlobalStockOrigin(req.body?.returnOrigin);
        if (!returnOrigin) {
            return res.status(400).json({ error: "Destino de Global Stock no autorizado." });
        }

        try {
            const rate = await consumeRateLimit(req, {
                scope: "global-stock-otp-verify",
                limit: 10,
                windowSeconds: 600,
                subject: admin.user.id
            });
            if (enforceRateLimit(res, rate, "Demasiados intentos de código. Pedí uno nuevo más tarde.")) return;
        } catch {
            return res.status(503).json({ error: "No se pudo validar la operación." });
        }

        const challengeId = String(req.body?.challengeId || "").trim();
        const code = String(req.body?.code || "").trim();

        if (
            !/^[0-9a-f-]{36}$/i.test(challengeId) ||
            !/^\d{6}$/.test(code)
        ) {
            return res.status(400).json({ error: "Código de verificación inválido." });
        }

        const challengesUrl = `${admin.supabaseUrl}/rest/v1/global_stock_authorization_challenges`;
        const query =
            `${challengesUrl}?id=eq.${encodeURIComponent(challengeId)}` +
            `&owner_user_id=eq.${encodeURIComponent(admin.user.id)}` +
            "&used_at=is.null&select=id,code_hash,salt,attempts,expires_at&limit=1";
        const loaded = await serviceRequest(query, admin.serviceKey);
        const challenge = Array.isArray(loaded.data) ? loaded.data[0] : null;

        if (
            !loaded.response.ok ||
            !challenge?.id ||
            new Date(challenge.expires_at).getTime() <= Date.now() ||
            Number(challenge.attempts || 0) >= 5
        ) {
            return res.status(400).json({ error: "El código venció o ya no puede utilizarse." });
        }

        const nextAttempts = Number(challenge.attempts || 0) + 1;
        await serviceRequest(
            `${challengesUrl}?id=eq.${encodeURIComponent(challenge.id)}`,
            admin.serviceKey,
            {
                method: "PATCH",
                body: JSON.stringify({ attempts: nextAttempts })
            }
        );

        const valid = safeHexEqual(
            hashOtp(code, challenge.salt),
            challenge.code_hash
        );

        if (!valid) {
            return res.status(400).json({
                error:
                    nextAttempts >= 5
                        ? "Código incorrecto. Pedí un código nuevo."
                        : "Código incorrecto."
            });
        }

        const usedAt = new Date().toISOString();
        await serviceRequest(
            `${challengesUrl}?id=eq.${encodeURIComponent(challenge.id)}&used_at=is.null`,
            admin.serviceKey,
            {
                method: "PATCH",
                body: JSON.stringify({ used_at: usedAt })
            }
        );

        const rawGrant = `gs_grant_${crypto.randomBytes(32).toString("base64url")}`;
        const grantsUrl = `${admin.supabaseUrl}/rest/v1/global_stock_authorization_grants`;
        const grantInserted = await serviceRequest(grantsUrl, admin.serviceKey, {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
                owner_user_id: admin.user.id,
                grant_hash: hashToken(rawGrant),
                expires_at: new Date(Date.now() + GRANT_TTL_MS).toISOString()
            })
        });

        if (!grantInserted.response.ok) {
            return res.status(502).json({ error: "No se pudo crear la autorización segura." });
        }

        const callback = new URL("/api/store-connector/callback", returnOrigin);
        callback.searchParams.set("store", String(process.env.PUBLIC_SITE_URL || "https://www.doradoarticulosdepesca.com.ar"));
        callback.searchParams.set("grant", rawGrant);

        return res.status(200).json({
            verified: true,
            callbackUrl: callback.toString()
        });
    }

    return res.status(400).json({ error: "Acción de autorización inválida." });
}
