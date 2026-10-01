import crypto from "node:crypto";

import { productPrice } from "../lib/pricing.js";
import { fetchWithTimeout } from "../lib/security.js";

function hashToken(token) {
    return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function jsonHeaders(serviceKey) {
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

function getBearer(req) {
    const auth = String(req.headers?.authorization || "").trim();
    return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function hasScope(integration, scope) {
    return Array.isArray(integration?.scopes) && integration.scopes.includes(scope);
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function authenticate(req, supabaseUrl, serviceKey) {
    const token = getBearer(req);
    if (!token || !token.startsWith("gs_dorado_") || token.length < 40) {
        return null;
    }

    const tokenHash = hashToken(token);
    const headers = jsonHeaders(serviceKey);
    const url =
        `${supabaseUrl}/rest/v1/global_stock_integrations` +
        `?token_hash=eq.${encodeURIComponent(tokenHash)}` +
        "&revoked_at=is.null" +
        "&select=id,owner_user_id,name,scopes,created_at,last_used_at" +
        "&limit=1";

    const response = await fetchWithTimeout(url, { headers }, 8000);
    const rows = await parseJson(response, []);
    const integration = Array.isArray(rows) ? rows[0] : null;

    if (!response.ok || !integration?.id) return null;

    // Si la cuenta que autorizó dejó de ser administradora, la integración deja de ser válida.
    const adminResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(integration.owner_user_id)}&select=user_id&limit=1`,
        { headers },
        8000
    );
    const admins = await parseJson(adminResponse, []);
    if (!adminResponse.ok || !Array.isArray(admins) || !admins[0]) return null;

    // No bloqueamos la respuesta si falla únicamente la marca de último uso.
    void fetchWithTimeout(
        `${supabaseUrl}/rest/v1/global_stock_integrations?id=eq.${encodeURIComponent(integration.id)}`,
        {
            method: "PATCH",
            headers,
            body: JSON.stringify({ last_used_at: new Date().toISOString() })
        },
        5000
    ).catch(() => {});

    return integration;
}

async function loadProducts(supabaseUrl, serviceKey) {
    const headers = jsonHeaders(serviceKey);
    const select = [
        "id",
        "nombre",
        "descripcion",
        "caracteristicas",
        "precio",
        "descuento_porcentaje",
        "imagen",
        "imagenes",
        "categoria",
        "marca",
        "stock",
        "activo",
        "costo",
        "proveedor",
        "codigo_barras",
        "stock_minimo",
        "updated_at"
    ].join(",");

    const productsResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/productos?select=${encodeURIComponent(select)}&order=id.asc`,
        { headers },
        10000
    );
    const products = await parseJson(productsResponse, []);

    if (!productsResponse.ok || !Array.isArray(products)) {
        throw new Error("PRODUCTS_UNAVAILABLE");
    }

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const ordersResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/pedidos?select=id&created_at=gte.${encodeURIComponent(since)}&or=(estado.eq.pagado,estado.eq.pagado_revisar_stock,estado.eq.pagado_cancelado_revisar)`,
        { headers },
        8000
    );
    const orders = await parseJson(ordersResponse, []);
    const soldByProduct = new Map();

    if (ordersResponse.ok && Array.isArray(orders) && orders.length) {
        const ids = orders.map((order) => String(order.id)).filter(Boolean);

        for (let start = 0; start < ids.length; start += 100) {
            const chunk = ids.slice(start, start + 100);
            const inFilter = chunk
                .map((id) => `"${id.replaceAll('"', "")}"`)
                .join(",");

            const itemsResponse = await fetchWithTimeout(
                `${supabaseUrl}/rest/v1/pedido_items?select=producto_id,cantidad&pedido_id=in.(${encodeURIComponent(inFilter)})`,
                { headers },
                8000
            );
            const items = await parseJson(itemsResponse, []);

            if (!itemsResponse.ok || !Array.isArray(items)) continue;

            for (const item of items) {
                if (item.producto_id === null || item.producto_id === undefined) continue;
                const id = String(item.producto_id);
                const units = Math.max(0, Number(item.cantidad) || 0);
                soldByProduct.set(id, (soldByProduct.get(id) || 0) + units);
            }
        }
    }

    return products.map((product) => {
        const pricing = productPrice(product);
        return {
            externalId: String(product.id),
            name: String(product.nombre || ""),
            description: String(product.descripcion || ""),
            features: String(product.caracteristicas || ""),
            price: pricing.final,
            originalPrice: Math.max(0, Number(product.precio) || 0),
            discountPercent: pricing.percent,
            stock: Math.max(0, Number(product.stock) || 0),
            minStock: Math.max(0, Number(product.stock_minimo) || 0),
            cost: numberOrNull(product.costo),
            category: String(product.categoria || ""),
            brand: String(product.marca || ""),
            supplier: String(product.proveedor || ""),
            barcode: String(product.codigo_barras || ""),
            image: String(product.imagen || ""),
            images: Array.isArray(product.imagenes)
                ? product.imagenes.map((value) => String(value || "").trim()).filter(Boolean)
                : [],
            active: Boolean(product.activo),
            sold30d: Math.max(0, Number(soldByProduct.get(String(product.id))) || 0),
            updatedAt: product.updated_at || null
        };
    });
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");

    if (!["GET", "PATCH"].includes(req.method)) {
        res.setHeader("Allow", "GET, PATCH");
        return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
    }

    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

    if (!supabaseUrl || !serviceKey) {
        return res.status(500).json({ error: "SERVER_NOT_CONFIGURED" });
    }

    const integration = await authenticate(req, supabaseUrl, serviceKey);
    if (!integration) {
        return res.status(401).json({ error: "INVALID_INTEGRATION_TOKEN" });
    }

    if (req.method === "GET") {
        const resource = String(req.query?.resource || "store").toLowerCase();

        if (resource === "store") {
            return res.status(200).json({
                verified: true,
                store: {
                    id: "dorado-articulos-de-pesca",
                    name: "Dorado Artículos de Pesca",
                    url: String(process.env.PUBLIC_SITE_URL || "https://www.doradoarticulosdepesca.com.ar"),
                    currency: "ARS",
                    platform: "Dorado Ecommerce"
                },
                scopes: integration.scopes,
                connectedAt: integration.created_at
            });
        }

        if (resource === "products") {
            if (!hasScope(integration, "catalog:read")) {
                return res.status(403).json({ error: "MISSING_SCOPE" });
            }

            try {
                const products = await loadProducts(supabaseUrl, serviceKey);
                return res.status(200).json({
                    verified: true,
                    source: "dorado",
                    currency: "ARS",
                    products,
                    syncedAt: new Date().toISOString(),
                    completeness: {
                        stock: "authoritative",
                        price: "authoritative",
                        sales30d: "authoritative_from_paid_orders",
                        cost: "authoritative_when_present",
                        supplier: "authoritative_when_present",
                        barcode: "authoritative_when_present"
                    }
                });
            } catch (error) {
                console.error("Global Stock product sync error:", error);
                return res.status(502).json({ error: "CATALOG_SYNC_FAILED" });
            }
        }

        return res.status(400).json({ error: "UNKNOWN_RESOURCE" });
    }

    if (!hasScope(integration, "inventory:write")) {
        return res.status(403).json({ error: "MISSING_SCOPE" });
    }

    const externalId = String(req.body?.externalId || "").trim();
    if (!/^\d+$/.test(externalId)) {
        return res.status(400).json({ error: "INVALID_PRODUCT_ID" });
    }

    const patch = {};

    if (req.body?.stock !== undefined) {
        const stock = Number(req.body.stock);
        if (!Number.isFinite(stock) || stock < 0 || stock > 100000000) {
            return res.status(400).json({ error: "INVALID_STOCK" });
        }
        patch.stock = Math.floor(stock);
    }

    if (req.body?.price !== undefined) {
        const price = Number(req.body.price);
        if (!Number.isFinite(price) || price < 0 || price > 999999999999) {
            return res.status(400).json({ error: "INVALID_PRICE" });
        }
        patch.precio = Number(price.toFixed(2));
    }

    if (req.body?.cost !== undefined) {
        if (req.body.cost === null || req.body.cost === "") {
            patch.costo = null;
        } else {
            const cost = Number(req.body.cost);
            if (!Number.isFinite(cost) || cost < 0 || cost > 999999999999) {
                return res.status(400).json({ error: "INVALID_COST" });
            }
            patch.costo = Number(cost.toFixed(2));
        }
    }

    if (req.body?.minStock !== undefined) {
        const minStock = Number(req.body.minStock);
        if (!Number.isFinite(minStock) || minStock < 0 || minStock > 100000000) {
            return res.status(400).json({ error: "INVALID_MIN_STOCK" });
        }
        patch.stock_minimo = Math.floor(minStock);
    }

    if (req.body?.supplier !== undefined) {
        patch.proveedor = String(req.body.supplier || "").trim().slice(0, 160) || null;
    }

    if (req.body?.barcode !== undefined) {
        patch.codigo_barras = String(req.body.barcode || "").trim().slice(0, 120) || null;
    }

    if (req.body?.active !== undefined) {
        patch.activo = Boolean(req.body.active);
    }

    if (!Object.keys(patch).length) {
        return res.status(400).json({ error: "EMPTY_PATCH" });
    }

    patch.updated_at = new Date().toISOString();

    const headers = jsonHeaders(serviceKey);
    const response = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(externalId)}`,
        {
            method: "PATCH",
            headers: {
                ...headers,
                Prefer: "return=representation"
            },
            body: JSON.stringify(patch)
        },
        8000
    );

    const rows = await parseJson(response, []);
    if (!response.ok || !Array.isArray(rows) || !rows[0]) {
        console.error("Global Stock product write error:", rows);
        return res.status(502).json({ error: "PRODUCT_UPDATE_FAILED" });
    }

    return res.status(200).json({
        ok: true,
        externalId,
        updatedAt: rows[0].updated_at || patch.updated_at
    });
}
