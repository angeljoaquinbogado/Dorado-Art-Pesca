import { fetchWithTimeout } from "./security.js";

export const DORADO_MAPS_URL = "https://maps.app.goo.gl/jWDsmRDAwD2SeWJS8";

function requiredEnv(name) {
    const value = String(process.env[name] || "").trim();
    if (!value) throw new Error(`MISSING_${name}`);
    return value;
}

async function json(response, fallback = null) {
    try {
        return await response.json();
    } catch {
        return fallback;
    }
}

async function googleJson(url, accessToken, options = {}) {
    const response = await fetchWithTimeout(
        url,
        {
            ...options,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json",
                ...(options.headers || {})
            }
        },
        12000
    );
    const data = await json(response, {});

    if (!response.ok) {
        const error = new Error(
            String(data?.error?.message || data?.message || `Google API error ${response.status}`)
        );
        error.status = response.status;
        error.googleCode = String(data?.error?.status || "");
        throw error;
    }

    return data;
}

async function supabase(path, options = {}) {
    const url = requiredEnv("SUPABASE_URL");
    const service = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    return fetchWithTimeout(
        `${url}${path}`,
        {
            ...options,
            headers: {
                apikey: service,
                Authorization: `Bearer ${service}`,
                Accept: "application/json",
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {})
            }
        },
        10000
    );
}

function normalizeName(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function locationScore(location) {
    const title = normalizeName(location?.title);
    let score = 0;
    if (title.includes("dorado")) score += 10;
    if (title.includes("pesca")) score += 6;
    if (title.includes("articulo")) score += 3;
    if (title.includes("art")) score += 1;
    return score;
}

export function googleBusinessOAuthConfig() {
    return {
        clientId: requiredEnv("GOOGLE_BUSINESS_CLIENT_ID"),
        clientSecret: requiredEnv("GOOGLE_BUSINESS_CLIENT_SECRET"),
        redirectUri: requiredEnv("GOOGLE_BUSINESS_REDIRECT_URI")
    };
}

export async function exchangeGoogleBusinessCode(code) {
    const { clientId, clientSecret, redirectUri } = googleBusinessOAuthConfig();

    const body = new URLSearchParams({
        code: String(code || ""),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
    });

    const response = await fetchWithTimeout(
        "https://oauth2.googleapis.com/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json"
            },
            body
        },
        12000
    );

    const data = await json(response, {});
    if (!response.ok || !data?.access_token) {
        throw new Error(String(data?.error_description || data?.error || "GOOGLE_TOKEN_EXCHANGE_FAILED"));
    }

    return data;
}

export async function refreshGoogleBusinessAccessToken(refreshToken) {
    const { clientId, clientSecret } = googleBusinessOAuthConfig();

    const body = new URLSearchParams({
        refresh_token: String(refreshToken || ""),
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token"
    });

    const response = await fetchWithTimeout(
        "https://oauth2.googleapis.com/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json"
            },
            body
        },
        12000
    );

    const data = await json(response, {});
    if (!response.ok || !data?.access_token) {
        throw new Error(String(data?.error_description || data?.error || "GOOGLE_TOKEN_REFRESH_FAILED"));
    }

    return data.access_token;
}

export async function discoverGoogleBusinessLocation(accessToken) {
    const accountData = await googleJson(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        accessToken
    );

    const accounts = Array.isArray(accountData?.accounts) ? accountData.accounts : [];
    if (!accounts.length) {
        throw new Error("GOOGLE_BUSINESS_NO_ACCOUNTS");
    }

    const candidates = [];

    for (const account of accounts.slice(0, 20)) {
        const accountName = String(account?.name || "").trim();
        if (!/^accounts\/\d+$/.test(accountName)) continue;

        let pageToken = "";
        let pages = 0;

        do {
            const params = new URLSearchParams({
                readMask: "name,title,storeCode,websiteUri",
                pageSize: "100"
            });
            if (pageToken) params.set("pageToken", pageToken);

            const locationData = await googleJson(
                `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${params.toString()}`,
                accessToken
            );

            const locations = Array.isArray(locationData?.locations) ? locationData.locations : [];
            for (const location of locations) {
                candidates.push({ accountName, account, location });
            }

            pageToken = String(locationData?.nextPageToken || "");
            pages += 1;
        } while (pageToken && pages < 10);
    }

    if (!candidates.length) {
        throw new Error("GOOGLE_BUSINESS_NO_LOCATIONS");
    }

    candidates.sort((a, b) => locationScore(b.location) - locationScore(a.location));
    const best = candidates[0];

    return {
        accountName: best.accountName,
        locationName: String(best.location?.name || "").trim(),
        locationTitle: String(best.location?.title || "Dorado Artículos de Pesca").trim()
    };
}

export async function saveGoogleBusinessConnection({
    refreshToken,
    accountName,
    locationName,
    locationTitle
}) {
    const payload = {
        id: 1,
        refresh_token: String(refreshToken || ""),
        account_name: String(accountName || ""),
        location_name: String(locationName || ""),
        location_title: String(locationTitle || ""),
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_sync_status: "conectado",
        last_error: null
    };

    const response = await supabase(
        "/rest/v1/google_business_connection?on_conflict=id",
        {
            method: "POST",
            headers: {
                Prefer: "resolution=merge-duplicates,return=minimal"
            },
            body: JSON.stringify(payload)
        }
    );

    if (!response.ok) {
        const data = await json(response, {});
        throw new Error(String(data?.message || "GOOGLE_CONNECTION_SAVE_FAILED"));
    }
}

export async function loadGoogleBusinessConnection() {
    const response = await supabase(
        "/rest/v1/google_business_connection?id=eq.1&select=id,refresh_token,account_name,location_name,location_title,connected_at,last_sync_at,last_sync_status,last_error&limit=1"
    );
    const rows = await json(response, []);

    if (!response.ok || !Array.isArray(rows)) {
        throw new Error("GOOGLE_CONNECTION_READ_FAILED");
    }

    return rows[0] || null;
}

function ratingNumber(value) {
    const map = {
        ONE: 1,
        TWO: 2,
        THREE: 3,
        FOUR: 4,
        FIVE: 5
    };
    const raw = String(value || "").toUpperCase();
    if (map[raw]) return map[raw];

    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.round(number))) : 5;
}

function reviewKey(accountName, locationName, reviewId) {
    const accountId = String(accountName || "").split("/").pop() || "account";
    const locationId = String(locationName || "").split("/").pop() || "location";
    return `gbp-${accountId}-${locationId}-${String(reviewId || "")}`.slice(0, 240);
}

async function fetchAllGoogleReviews(accessToken, accountName, locationName) {
    const reviews = [];
    let pageToken = "";
    let pages = 0;

    do {
        const params = new URLSearchParams({ pageSize: "50" });
        if (pageToken) params.set("pageToken", pageToken);

        const data = await googleJson(
            `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews?${params.toString()}`,
            accessToken
        );

        if (Array.isArray(data?.reviews)) reviews.push(...data.reviews);
        pageToken = String(data?.nextPageToken || "");
        pages += 1;
    } while (pageToken && pages < 20);

    return reviews.slice(0, 1000);
}

async function updateConnectionSync(status, errorMessage = null) {
    const response = await supabase(
        "/rest/v1/google_business_connection?id=eq.1",
        {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
                last_sync_at: new Date().toISOString(),
                last_sync_status: status,
                last_error: errorMessage ? String(errorMessage).slice(0, 500) : null,
                updated_at: new Date().toISOString()
            })
        }
    );

    if (!response.ok) {
        console.error("Could not update Google Business sync status", { status: response.status });
    }
}

export async function syncGoogleBusinessReviews({
    accessToken = "",
    connection = null
} = {}) {
    const saved = connection || await loadGoogleBusinessConnection();
    if (!saved?.refresh_token || !saved?.account_name || !saved?.location_name) {
        throw new Error("GOOGLE_BUSINESS_NOT_CONNECTED");
    }

    let token = String(accessToken || "").trim();
    if (!token) {
        token = await refreshGoogleBusinessAccessToken(saved.refresh_token);
    }

    try {
        const reviews = await fetchAllGoogleReviews(
            token,
            saved.account_name,
            saved.location_name
        );

        const rows = reviews
            .map(review => {
                const reviewId = String(review?.reviewId || review?.name || "").trim();
                if (!reviewId) return null;

                return {
                    external_id: reviewKey(saved.account_name, saved.location_name, reviewId),
                    autor: String(review?.reviewer?.displayName || "Cliente de Google").slice(0, 120),
                    avatar_url: String(review?.reviewer?.profilePhotoUrl || "").slice(0, 1500) || null,
                    calificacion: ratingNumber(review?.starRating),
                    comentario: String(review?.comment || "").slice(0, 4000) || null,
                    fecha_resena: review?.createTime || review?.updateTime || null,
                    fecha_texto: null,
                    fuente_url: DORADO_MAPS_URL,
                    activa: true,
                    updated_at: new Date().toISOString()
                };
            })
            .filter(Boolean);

        if (rows.length) {
            const upsertResponse = await supabase(
                "/rest/v1/resenas_google?on_conflict=external_id",
                {
                    method: "POST",
                    headers: {
                        Prefer: "resolution=merge-duplicates,return=minimal"
                    },
                    body: JSON.stringify(rows)
                }
            );

            if (!upsertResponse.ok) {
                const data = await json(upsertResponse, {});
                throw new Error(String(data?.message || "GOOGLE_REVIEWS_UPSERT_FAILED"));
            }

            // La carga manual inicial se oculta sólo después de una sincronización
            // real exitosa para no mostrar duplicados del mismo Perfil de Empresa.
            await supabase(
                "/rest/v1/resenas_google?external_id=like.manual-google-*",
                {
                    method: "PATCH",
                    headers: { Prefer: "return=minimal" },
                    body: JSON.stringify({
                        activa: false,
                        updated_at: new Date().toISOString()
                    })
                }
            );
        }

        await updateConnectionSync("ok", null);

        return {
            ok: true,
            total: rows.length,
            location: String(saved.location_title || "")
        };
    } catch (error) {
        const code = error?.status === 403
            ? "google_api_sin_acceso"
            : "error";
        await updateConnectionSync(code, error?.message || error);
        throw error;
    }
}
