import { fetchWithTimeout } from "./security.js";

async function parseJson(response, fallback = null) {
    try {
        return await response.json();
    } catch {
        return fallback;
    }
}

export async function requireAdmin(req) {
    const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
    const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const auth = String(req?.headers?.authorization || "").trim();

    if (!supabaseUrl || !serviceKey) {
        return { ok: false, status: 500, error: "Configuración incompleta del servidor." };
    }

    if (!auth.startsWith("Bearer ")) {
        return { ok: false, status: 401, error: "Sesión requerida." };
    }

    const accessToken = auth.slice(7).trim();

    const userResponse = await fetchWithTimeout(
        `${supabaseUrl}/auth/v1/user`,
        {
            headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/json"
            }
        },
        8000
    );

    const user = await parseJson(userResponse, null);
    if (!userResponse.ok || !user?.id) {
        return { ok: false, status: 401, error: "La sesión del administrador venció." };
    }

    const adminResponse = await fetchWithTimeout(
        `${supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id&limit=1`,
        {
            headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
                Accept: "application/json"
            }
        },
        8000
    );

    const admins = await parseJson(adminResponse, []);
    if (!adminResponse.ok || !Array.isArray(admins) || !admins[0]) {
        return { ok: false, status: 403, error: "No tenés permisos de administrador." };
    }

    return {
        ok: true,
        status: 200,
        user,
        accessToken,
        supabaseUrl,
        serviceKey
    };
}
