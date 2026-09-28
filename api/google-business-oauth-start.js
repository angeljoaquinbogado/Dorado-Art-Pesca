import { createHmac, randomBytes } from "node:crypto";
import { requireAdmin } from "../lib/admin-auth.js";
import { googleBusinessOAuthConfig } from "../lib/google-business.js";
import { isSameOriginRequest } from "../lib/security.js";

function signState(payload, secret) {
    const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
    return `${encoded}.${signature}`;
}

export default async function handler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

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
        const expires = Date.now() + 10 * 60 * 1000;
        const state = signState({
            uid: String(admin.user.id),
            nonce,
            exp: expires
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
        return res.status(500).json({
            error: "No se pudo iniciar la conexión con Google."
        });
    }
}
