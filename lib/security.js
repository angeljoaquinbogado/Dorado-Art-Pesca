import { createHmac, timingSafeEqual } from "node:crypto";

function firstHeader(value) {
    if (Array.isArray(value)) return String(value[0] || "");
    return String(value || "");
}

export function clientIp(req) {
    const candidates = [
        firstHeader(req.headers["x-vercel-forwarded-for"]),
        firstHeader(req.headers["x-real-ip"]),
        firstHeader(req.headers["x-forwarded-for"]),
        String(req.socket?.remoteAddress || "")
    ];

    for (const candidate of candidates) {
        const value = candidate.split(",")[0].trim();
        if (value) return value.slice(0, 120);
    }

    return "unknown";
}

function rateSecret() {
    const explicit = String(process.env.RATE_LIMIT_SECRET || "").trim();
    if (explicit) return explicit;

    // Compatibilidad segura: si todavía no existe RATE_LIMIT_SECRET en Vercel,
    // derivamos una subclave distinta a partir del service role. La credencial
    // original nunca se usa directamente como clave HMAC ni se expone.
    const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!service) return "";

    return createHmac("sha256", service)
        .update("dorado-art-pesca/rate-limit/v1")
        .digest("hex");
}

function rateKey(req, scope, subject = "") {
    const secret = rateSecret();
    if (!secret) throw new Error("RATE_LIMIT_SECRET_MISSING");

    return createHmac("sha256", secret)
        .update([
            "dorado-art-pesca-v2",
            String(scope || "api"),
            clientIp(req),
            String(subject || "").toLowerCase().trim().slice(0, 200)
        ].join("|"))
        .digest("hex");
}

export async function consumeRateLimit(req, {
    scope,
    limit,
    windowSeconds,
    subject = ""
}) {
    const url = String(process.env.SUPABASE_URL || "").trim();
    const service = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!url || !service) throw new Error("RATE_LIMIT_CONFIG_MISSING");

    const key = rateKey(req, scope, subject);

    const response = await fetch(`${url}/rest/v1/rpc/consume_api_rate_limit`, {
        method: "POST",
        headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({
            p_key_hash: key,
            p_limit: limit,
            p_window_seconds: windowSeconds
        })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        console.error("Rate limit RPC failed", {
            scope,
            status: response.status
        });
        throw new Error("RATE_LIMIT_UNAVAILABLE");
    }

    return data && typeof data === "object"
        ? data
        : { allowed: true, retry_after: 0 };
}

export function enforceRateLimit(res, result, message = "Demasiadas solicitudes. Probá nuevamente en unos minutos.") {
    if (!result || result.allowed !== false) return false;

    const retryAfter = Math.max(1, Number(result.retry_after) || 60);
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: message });
    return true;
}

function safeHexEqual(a, b) {
    const left = String(a || "").trim().toLowerCase();
    const right = String(b || "").trim().toLowerCase();

    if (!/^[0-9a-f]+$/.test(left) || !/^[0-9a-f]+$/.test(right)) {
        return false;
    }

    if (left.length !== right.length) return false;

    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");

    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyMercadoPagoSignature(req, paymentId) {
    const secret = String(process.env.MERCADOPAGO_WEBHOOK_SECRET || "").trim();
    const requireSignature =
        String(process.env.MERCADOPAGO_REQUIRE_SIGNATURE || "").toLowerCase() === "true";

    if (!secret) {
        return {
            configured: false,
            required: requireSignature,
            valid: !requireSignature
        };
    }

    const signature = firstHeader(req.headers["x-signature"]);
    const requestId = firstHeader(req.headers["x-request-id"]).trim();

    const parts = Object.fromEntries(
        signature
            .split(",")
            .map(part => part.trim().split("=", 2))
            .filter(([key, value]) => key && value)
    );

    const ts = String(parts.ts || "").trim();
    const received = String(parts.v1 || "").trim();

    if (!ts || !received || !requestId || !paymentId) {
        return {
            configured: true,
            required: requireSignature,
            valid: false
        };
    }

    const tsNumber = Number(ts);
    const tsMs = tsNumber < 1e12 ? tsNumber * 1000 : tsNumber;
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 10 * 60 * 1000) {
        return {
            configured: true,
            required: requireSignature,
            valid: false
        };
    }

    const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac("sha256", secret)
        .update(manifest)
        .digest("hex");

    return {
        configured: true,
        required: requireSignature,
        valid: safeHexEqual(received, expected)
    };
}


export function publicSiteOrigin(req) {
    const candidates = [
        process.env.PUBLIC_SITE_URL,
        process.env.VERCEL_PROJECT_PRODUCTION_URL,
        process.env.VERCEL_URL
    ];

    for (const candidate of candidates) {
        const raw = String(candidate || "").trim();
        if (!raw) continue;
        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
            const url = new URL(normalized);
            if (url.protocol !== "https:" && process.env.NODE_ENV === "production") continue;
            if (!url.hostname) continue;
            url.pathname = "";
            url.search = "";
            url.hash = "";
            return url.origin;
        } catch {}
    }

    const host = firstHeader(req?.headers?.["x-forwarded-host"] || req?.headers?.host).trim();
    if (host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host)) {
        const proto = firstHeader(req?.headers?.["x-forwarded-proto"]).toLowerCase() === "http"
            ? "http"
            : "https";
        if (proto === "https" || process.env.NODE_ENV !== "production") {
            return `${proto}://${host}`;
        }
    }

    return "https://dorado-art-pesca.vercel.app";
}

export function isSameOriginRequest(req) {
    const origin = firstHeader(req?.headers?.origin).trim();
    if (!origin) return true;

    try {
        return new URL(origin).origin === publicSiteOrigin(req);
    } catch {
        return false;
    }
}

export function requireJsonRequest(req) {
    const contentType = firstHeader(req?.headers?.["content-type"]).toLowerCase();
    return contentType.startsWith("application/json");
}

export async function fetchWithTimeout(input, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 8000));

    try {
        return await fetch(input, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

export function bodyTooLarge(req, maxBytes = 32768) {
    const length = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(length) && length > maxBytes) return true;

    try {
        return Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8") > maxBytes;
    } catch {
        return true;
    }
}
