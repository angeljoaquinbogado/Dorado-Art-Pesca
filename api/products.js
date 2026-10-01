import crypto from "node:crypto";

import { requireAdmin } from "../lib/admin-auth.js";
import { productPrice } from "../lib/pricing.js";
import { fetchWithTimeout } from "../lib/security.js";

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

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(String(token || ""))
        .digest("hex");
}

function getBearer(req) {
    const auth = String(req.headers?.authorization || "").trim();
    return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function hasScope(integration, scope) {
    return (
        Array.isArray(integration?.scopes) &&
        integration.scopes.includes(scope)
    );
}

function safeIntegrationName(value) {
    const trimmed = String(value || "Global Stock")
        .trim()
        .replace(/\s+/g, " ");
    return (trimmed || "Global Stock").slice(0, 80);
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function handleIntegrationAdmin(req, res) {
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

    const base =
        `${admin.supabaseUrl}/rest/v1/global_stock_integrations`;
    const headers = serviceHeaders(admin.serviceKey);

    if (req.method === "GET") {
        const requestUrl =
            `${base}?owner_user_id=eq.${encodeURIComponent(admin.user.id)}` +
            "&revoked_at=is.null" +
            "&select=id,name,token_prefix,scopes,created_at,last_used_at" +
            "&order=created_at.desc";

        const response = await fetchWithTimeout(
            requestUrl,
            { headers },
            8000
        );
        const rows = await parseJson(response, []);

        if (!response.ok || !Array.isArray(rows)) {
            console.error("Global Stock integration list error:", rows);
            return res
                .status(502)
                .json({ error: "No se pudieron cargar las integraciones." });
        }

        return res.status(200).json({ integrations: rows });
    }

    if (req.method === "POST") {
        const rawToken =
            `gs_dorado_${crypto.randomBytes(32).toString("base64url")}`;
        const tokenHash = hashToken(rawToken);
        const tokenPrefix = rawToken.slice(0, 18);
        const name = safeIntegrationName(req.body?.name);

        const response = await fetchWithTimeout(
            base,
            {
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
            },
            8000
        );

        const rows = await parseJson(response, []);
        const created = Array.isArray(rows) ? rows[0] : null;

        if (!response.ok || !created?.id) {
            console.error(
                "Global Stock integration create error:",
                rows
            );
            return res
                .status(502)
                .json({ error: "No se pudo crear la conexión." });
        }

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

    const requestUrl =
        `${base}?id=eq.${encodeURIComponent(id)}` +
        `&owner_user_id=eq.${encodeURIComponent(admin.user.id)}`;

    const response = await fetchWithTimeout(
        requestUrl,
        {
            method: "PATCH",
            headers: {
                ...headers,
                Prefer: "return=representation"
            },
            body: JSON.stringify({
                revoked_at: new Date().toISOString()
            })
        },
        8000
    );

    const rows = await parseJson(response, []);
    if (!response.ok || !Array.isArray(rows) || !rows[0]) {
        return res
            .status(404)
            .json({ error: "Integración no encontrada." });
    }

    return res.status(200).json({ ok: true });
}

async function authenticateConnector(
    req,
    supabaseUrl,
    serviceKey
) {
    const token = getBearer(req);
    if (
        !token ||
        !token.startsWith("gs_dorado_") ||
        token.length < 40
    ) {
        return null;
    }

    const tokenHash = hashToken(token);
    const headers = serviceHeaders(serviceKey);
    const requestUrl =
        `${supabaseUrl}/rest/v1/global_stock_integrations` +
        `?token_hash=eq.${encodeURIComponent(tokenHash)}` +
        "&revoked_at=is.null" +
        "&select=id,owner_user_id,name,scopes,created_at,last_used_at" +
        "&limit=1";

    const response = await fetchWithTimeout(
        requestUrl,
        { headers },
        8000
    );
    const rows = await parseJson(response, []);
    const integration = Array.isArray(rows) ? rows[0] : null;

    if (!response.ok || !integration?.id) return null;

    const adminResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(
            integration.owner_user_id
        )}&select=user_id&limit=1`,
        { headers },
        8000
    );
    const admins = await parseJson(adminResponse, []);

    if (
        !adminResponse.ok ||
        !Array.isArray(admins) ||
        !admins[0]
    ) {
        return null;
    }

    void fetchWithTimeout(
        `${supabaseUrl}/rest/v1/global_stock_integrations?id=eq.${encodeURIComponent(
            integration.id
        )}`,
        {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                last_used_at: new Date().toISOString()
            })
        },
        5000
    ).catch(() => {});

    return integration;
}

async function loadConnectorProducts(supabaseUrl, serviceKey) {
    const headers = serviceHeaders(serviceKey);
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
        "control_stock",
        "activo",
        "costo",
        "proveedor",
        "codigo_barras",
        "stock_minimo",
        "updated_at"
    ].join(",");

    const productsResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/productos?select=${encodeURIComponent(
            select
        )}&order=id.asc`,
        { headers },
        10000
    );
    const products = await parseJson(productsResponse, []);

    if (!productsResponse.ok || !Array.isArray(products)) {
        throw new Error("PRODUCTS_UNAVAILABLE");
    }

    const since = new Date(
        Date.now() - 30 * 86400000
    ).toISOString();

    const ordersResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/pedidos?select=id&created_at=gte.${encodeURIComponent(
            since
        )}&or=(estado.eq.pagado,estado.eq.pagado_revisar_stock,estado.eq.pagado_cancelado_revisar)`,
        { headers },
        8000
    );
    const orders = await parseJson(ordersResponse, []);
    const soldByProduct = new Map();

    if (
        ordersResponse.ok &&
        Array.isArray(orders) &&
        orders.length
    ) {
        const ids = orders
            .map((order) => String(order.id || ""))
            .filter(Boolean);

        for (let start = 0; start < ids.length; start += 100) {
            const chunk = ids.slice(start, start + 100);
            const filter = `in.(${chunk.join(",")})`;

            const itemsResponse = await fetchWithTimeout(
                `${supabaseUrl}/rest/v1/pedido_items?select=producto_id,cantidad&pedido_id=${encodeURIComponent(
                    filter
                )}`,
                { headers },
                8000
            );
            const items = await parseJson(itemsResponse, []);

            if (!itemsResponse.ok || !Array.isArray(items)) {
                continue;
            }

            for (const item of items) {
                if (
                    item.producto_id === null ||
                    item.producto_id === undefined
                ) {
                    continue;
                }
                const id = String(item.producto_id);
                const units = Math.max(
                    0,
                    Number(item.cantidad) || 0
                );
                soldByProduct.set(
                    id,
                    (soldByProduct.get(id) || 0) + units
                );
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
            originalPrice: Math.max(
                0,
                Number(product.precio) || 0
            ),
            discountPercent: pricing.percent,
            stock: Math.max(0, Number(product.stock) || 0),
            controlStock: Boolean(product.control_stock),
            minStock: Math.max(
                0,
                Number(product.stock_minimo) || 0
            ),
            cost: numberOrNull(product.costo),
            category: String(product.categoria || ""),
            brand: String(product.marca || ""),
            supplier: String(product.proveedor || ""),
            barcode: String(product.codigo_barras || ""),
            image: String(product.imagen || ""),
            images: Array.isArray(product.imagenes)
                ? product.imagenes
                    .map((value) =>
                        String(value || "").trim()
                    )
                    .filter(Boolean)
                : [],
            active: Boolean(product.activo),
            sold30d: Math.max(
                0,
                Number(
                    soldByProduct.get(String(product.id))
                ) || 0
            ),
            updatedAt: product.updated_at || null
        };
    });
}

async function handleConnector(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");

    if (!["GET", "PATCH"].includes(req.method)) {
        res.setHeader("Allow", "GET, PATCH");
        return res
            .status(405)
            .json({ error: "METHOD_NOT_ALLOWED" });
    }

    const supabaseUrl = String(
        process.env.SUPABASE_URL || ""
    ).trim();
    const serviceKey = String(
        process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    ).trim();

    if (!supabaseUrl || !serviceKey) {
        return res
            .status(500)
            .json({ error: "SERVER_NOT_CONFIGURED" });
    }

    const integration = await authenticateConnector(
        req,
        supabaseUrl,
        serviceKey
    );
    if (!integration) {
        return res
            .status(401)
            .json({ error: "INVALID_INTEGRATION_TOKEN" });
    }

    if (req.method === "GET") {
        const resource = String(
            req.query?.resource || "store"
        ).toLowerCase();

        if (resource === "store") {
            return res.status(200).json({
                verified: true,
                store: {
                    id: "dorado-articulos-de-pesca",
                    name: "Dorado Artículos de Pesca",
                    url: String(
                        process.env.PUBLIC_SITE_URL ||
                        "https://www.doradoarticulosdepesca.com.ar"
                    ),
                    currency: "ARS",
                    platform: "Dorado Ecommerce"
                },
                scopes: integration.scopes,
                connectedAt: integration.created_at
            });
        }

        if (resource === "products") {
            if (
                !hasScope(integration, "catalog:read")
            ) {
                return res
                    .status(403)
                    .json({ error: "MISSING_SCOPE" });
            }

            try {
                const products =
                    await loadConnectorProducts(
                        supabaseUrl,
                        serviceKey
                    );

                return res.status(200).json({
                    verified: true,
                    source: "dorado",
                    currency: "ARS",
                    products,
                    syncedAt: new Date().toISOString(),
                    completeness: {
                        stock: "authoritative",
                        price: "authoritative",
                        sales30d:
                            "authoritative_from_paid_orders",
                        cost: "authoritative_when_present",
                        supplier:
                            "authoritative_when_present",
                        barcode:
                            "authoritative_when_present"
                    }
                });
            } catch (error) {
                console.error(
                    "Global Stock product sync error:",
                    error
                );
                return res
                    .status(502)
                    .json({
                        error: "CATALOG_SYNC_FAILED"
                    });
            }
        }

        return res
            .status(400)
            .json({ error: "UNKNOWN_RESOURCE" });
    }

    if (
        !hasScope(integration, "inventory:write")
    ) {
        return res
            .status(403)
            .json({ error: "MISSING_SCOPE" });
    }

    const externalId = String(
        req.body?.externalId || ""
    ).trim();
    if (!/^\d+$/.test(externalId)) {
        return res
            .status(400)
            .json({ error: "INVALID_PRODUCT_ID" });
    }

    const patch = {};

    if (req.body?.stock !== undefined) {
        const stock = Number(req.body.stock);
        if (
            !Number.isFinite(stock) ||
            stock < 0 ||
            stock > 100000000
        ) {
            return res
                .status(400)
                .json({ error: "INVALID_STOCK" });
        }
        patch.stock = Math.floor(stock);
    }

    if (req.body?.price !== undefined) {
        const price = Number(req.body.price);
        if (
            !Number.isFinite(price) ||
            price < 0 ||
            price > 999999999999
        ) {
            return res
                .status(400)
                .json({ error: "INVALID_PRICE" });
        }
        patch.precio = Number(price.toFixed(2));
    }

    if (req.body?.cost !== undefined) {
        if (
            req.body.cost === null ||
            req.body.cost === ""
        ) {
            patch.costo = null;
        } else {
            const cost = Number(req.body.cost);
            if (
                !Number.isFinite(cost) ||
                cost < 0 ||
                cost > 999999999999
            ) {
                return res
                    .status(400)
                    .json({ error: "INVALID_COST" });
            }
            patch.costo = Number(cost.toFixed(2));
        }
    }

    if (req.body?.minStock !== undefined) {
        const minStock = Number(req.body.minStock);
        if (
            !Number.isFinite(minStock) ||
            minStock < 0 ||
            minStock > 100000000
        ) {
            return res
                .status(400)
                .json({ error: "INVALID_MIN_STOCK" });
        }
        patch.stock_minimo = Math.floor(minStock);
    }

    if (req.body?.supplier !== undefined) {
        patch.proveedor =
            String(req.body.supplier || "")
                .trim()
                .slice(0, 160) || null;
    }

    if (req.body?.barcode !== undefined) {
        patch.codigo_barras =
            String(req.body.barcode || "")
                .trim()
                .slice(0, 120) || null;
    }

    if (req.body?.active !== undefined) {
        patch.activo = Boolean(req.body.active);
    }

    if (!Object.keys(patch).length) {
        return res
            .status(400)
            .json({ error: "EMPTY_PATCH" });
    }

    patch.updated_at = new Date().toISOString();

    const headers = serviceHeaders(serviceKey);
    const response = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/productos?id=eq.${encodeURIComponent(
            externalId
        )}`,
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
    if (
        !response.ok ||
        !Array.isArray(rows) ||
        !rows[0]
    ) {
        console.error(
            "Global Stock product write error:",
            rows
        );
        return res
            .status(502)
            .json({ error: "PRODUCT_UPDATE_FAILED" });
    }

    return res.status(200).json({
        ok: true,
        externalId,
        updatedAt:
            rows[0].updated_at || patch.updated_at
    });
}

async function handlePublicProducts(req, res) {
    res.setHeader(
        "Cache-Control",
        "public, max-age=0, must-revalidate"
    );
    res.setHeader(
        "CDN-Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=600"
    );
    res.setHeader(
        "Vercel-CDN-Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=600"
    );

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res
            .status(405)
            .json({ error: "Método no permitido" });
    }

    const url = String(
        process.env.SUPABASE_URL || ""
    ).trim();
    const service = String(
        process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    ).trim();
    const publishable = String(
        process.env.SUPABASE_PUBLISHABLE_KEY || ""
    ).trim();
    const key = service || publishable;

    if (!url || !key) {
        return res
            .status(500)
            .json({
                error: "Configuración incompleta del servidor"
            });
    }

    try {
        const pageSize = 1000;
        const rows = [];
        let includeDiscount = true;

        for (let page = 0; page < 50; page += 1) {
            const from = page * pageSize;
            const to = from + pageSize - 1;
            const select = includeDiscount
                ? "id,nombre,descripcion,caracteristicas,precio,descuento_porcentaje,imagen,imagenes,categoria,marca,stock,control_stock,activo"
                : "id,nombre,descripcion,caracteristicas,precio,imagen,imagenes,categoria,marca,stock,control_stock,activo";

            let response = await fetchWithTimeout(
                `${url}/rest/v1/productos?select=${select}&activo=eq.true&order=id.asc`,
                {
                    headers: {
                        apikey: key,
                        Authorization: `Bearer ${key}`,
                        Accept: "application/json",
                        Range: `${from}-${to}`,
                        "Range-Unit": "items"
                    }
                },
                8000
            );
            let data = await response
                .json()
                .catch(() => []);

            if (
                !response.ok &&
                includeDiscount &&
                page === 0
            ) {
                includeDiscount = false;
                response = await fetchWithTimeout(
                    `${url}/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,imagen,imagenes,categoria,marca,stock,control_stock,activo&activo=eq.true&order=id.asc`,
                    {
                        headers: {
                            apikey: key,
                            Authorization: `Bearer ${key}`,
                            Accept: "application/json",
                            Range: `${from}-${to}`,
                            "Range-Unit": "items"
                        }
                    },
                    8000
                );
                data = await response
                    .json()
                    .catch(() => []);
            }

            if (
                !response.ok ||
                !Array.isArray(data)
            ) {
                console.error(
                    "Supabase products error:",
                    data
                );
                return res
                    .status(502)
                    .json({
                        error: "No se pudieron cargar los productos"
                    });
            }

            rows.push(...data);
            if (data.length < pageSize) break;
        }

        const safe = rows.map((product) => ({
            id: product.id,
            nombre: String(product.nombre || ""),
            descripcion: String(
                product.descripcion || ""
            ),
            caracteristicas: String(
                product.caracteristicas || ""
            ),
            precio: productPrice(product).final,
            precio_original: Math.max(
                0,
                Number(product.precio) || 0
            ),
            descuento_porcentaje:
                productPrice(product).percent,
            imagen: String(product.imagen || ""),
            imagenes: Array.isArray(product.imagenes)
                ? product.imagenes
                    .map((value) =>
                        String(value || "").trim()
                    )
                    .filter(Boolean)
                : [],
            categoria: String(product.categoria || ""),
            marca: String(product.marca || ""),
            stock: Math.max(
                0,
                Number(product.stock) || 0
            ),
            control_stock: Boolean(product.control_stock),
            activo: Boolean(product.activo)
        }));

        return res.status(200).json(safe);
    } catch (error) {
        console.error("Products API error:", error);
        return res
            .status(500)
            .json({
                error: "Error conectando con el catálogo"
            });
    }
}

export default async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");

    const mode = String(req.query?.mode || "").toLowerCase();

    if (mode === "global-stock-integrations") {
        return handleIntegrationAdmin(req, res);
    }

    if (mode === "global-stock-connector") {
        return handleConnector(req, res);
    }

    return handlePublicProducts(req, res);
}
