import crypto from "node:crypto";

import { requireAdmin } from "../lib/admin-auth.js";
import { fetchWithTimeout } from "../lib/security.js";

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function serviceHeaders(serviceKey) {
    return {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
        "Content-Type": "application/json"
    };
}

async function parseJson(response, fallback) {
    try {
        return await response.json();
    } catch {
        return fallback;
    }
}

function safeName(value) {
    const trimmed = String(value || "Global Stock").trim().replace(/\s+/g, " ");
    return (trimmed || "Global Stock").slice(0, 80);
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");

    if (!["GET", "POST", "DELETE"].includes(req.method)) {
        res.setHeader("Allow", "GET, POST, DELETE");
        return res.status(405).json({ error: "Método no permitido" });
    }

    const admin = await requireAdmin(req);
    if (!admin.ok) {
        return res.status(admin.status).json({ error: admin.error });
    }

    if (!admin.serviceKey) {
        return res.status(500).json({
            error: "Falta la clave de servicio para administrar integraciones."
        });
    }

    const base = `${admin.supabaseUrl}/rest/v1/global_stock_integrations`;
    const headers = serviceHeaders(admin.serviceKey);

    if (req.method === "GET") {
        const url =
            `${base}?owner_user_id=eq.${encodeURIComponent(admin.user.id)}` +
            "&revoked_at=is.null" +
            "&select=id,name,token_prefix,scopes,created_at,last_used_at" +
            "&order=created_at.desc";

        const response = await fetchWithTimeout(url, { headers }, 8000);
        const rows = await parseJson(response, []);

        if (!response.ok || !Array.isArray(rows)) {
            console.error("Global Stock integration list error:", rows);
            return res.status(502).json({ error: "No se pudieron cargar las integraciones." });
        }

        return res.status(200).json({ integrations: rows });
    }

    if (req.method === "POST") {
        const rawToken = `gs_dorado_${crypto.randomBytes(32).toString("base64url")}`;
        const tokenHash = hashToken(rawToken);
        const tokenPrefix = rawToken.slice(0, 18);
        const name = safeName(req.body?.name);

        const response = await fetchWithTimeout(base, {
            method: "POST",
            headers: {
                ...headers,
                Prefer: "return=representation"
            },
            body: JSON.stringify({
                owner_user_id: admin.user.id,
                name,
                token_hash: tokenHash,
                token_prefix: tokenPrefix,
                scopes: [
                    "catalog:read",
                    "inventory:read",
                    "inventory:write",
                    "orders:read"
                ]
            })
        }, 8000);

        const rows = await parseJson(response, []);
        const created = Array.isArray(rows) ? rows[0] : null;

        if (!response.ok || !created?.id) {
            console.error("Global Stock integration create error:", rows);
            return res.status(502).json({ error: "No se pudo crear la conexión." });
        }

        // El token completo se devuelve una sola vez. En la base solo queda su hash.
        return res.status(201).json({
            integration: {
                id: created.id,
                name: created.name,
                tokenPrefix: created.token_prefix,
                scopes: created.scopes,
                createdAt: created.created_at
            },
            token: rawToken
        });
    }

    const id = String(req.body?.id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return res.status(400).json({ error: "Integración inválida." });
    }

    const url =
        `${base}?id=eq.${encodeURIComponent(id)}` +
        `&owner_user_id=eq.${encodeURIComponent(admin.user.id)}`;

    const response = await fetchWithTimeout(url, {
        method: "PATCH",
        headers: {
            ...headers,
            Prefer: "return=representation"
        },
        body: JSON.stringify({
            revoked_at: new Date().toISOString()
        })
    }, 8000);

    const rows = await parseJson(response, []);
    if (!response.ok || !Array.isArray(rows) || !rows[0]) {
        return res.status(404).json({ error: "Integración no encontrada." });
    }

    return res.status(200).json({ ok: true });
}
