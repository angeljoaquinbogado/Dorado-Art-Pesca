import { consumeRateLimit, enforceRateLimit, bodyTooLarge } from "../lib/security.js";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function parseJson(response,fallback){
    try{return await response.json();}catch{return fallback;}
}

export default async function handler(req,res){
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Content-Type-Options","nosniff");

    if(req.method!=="POST"){
        res.setHeader("Allow","POST");
        return res.status(405).json({error:"Método no permitido"});
    }

    if(bodyTooLarge(req,32*1024)){
        return res.status(413).json({error:"La solicitud es demasiado grande."});
    }

    try{
        const rate=await consumeRateLimit(req,{
            scope:"admin-delete-orders",
            limit:12,
            windowSeconds:60
        });
        if(enforceRateLimit(res,rate,"Demasiadas operaciones administrativas. Esperá un momento."))return;
    }catch(error){
        console.error("Admin delete rate limit error:",error?.message||error);
        return res.status(503).json({error:"No se pudo validar la operación."});
    }

    const supabaseUrl=process.env.SUPABASE_URL;
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;

    if(!supabaseUrl||!serviceKey){
        return res.status(500).json({error:"Configuración incompleta del servidor."});
    }

    const auth=String(req.headers.authorization||"").trim();
    if(!auth.startsWith("Bearer ")){
        return res.status(401).json({error:"Sesión requerida."});
    }

    const accessToken=auth.slice(7).trim();
    const ids=Array.isArray(req.body?.ids)
        ? [...new Set(req.body.ids.map(v=>String(v||"").trim()))]
        : [];

    if(!ids.length||ids.length>200||ids.some(id=>!UUID_RE.test(id))){
        return res.status(400).json({error:"Lista de pedidos inválida."});
    }

    try{
        const rpcResponse=await fetch(
            `${supabaseUrl}/rest/v1/rpc/admin_delete_orders`,
            {
                method:"POST",
                headers:{
                    apikey:serviceKey,
                    Authorization:`Bearer ${accessToken}`,
                    "Content-Type":"application/json",
                    Accept:"application/json"
                },
                body:JSON.stringify({p_ids:ids})
            }
        );

        const result=await parseJson(rpcResponse,null);

        if(!rpcResponse.ok){
            console.error("admin_delete_orders RPC failed:",result);

            if(result?.code==="42501"){
                return res.status(403).json({error:"No tenés permisos para eliminar pedidos."});
            }

            if(result?.code==="PGRST202"){
                return res.status(500).json({error:"Falta crear la función admin_delete_orders en Supabase."});
            }

            return res.status(502).json({
                error:result?.message
                    ? `Supabase rechazó el borrado: ${result.message}`
                    : "No se pudieron eliminar los pedidos."
            });
        }

        return res.status(200).json({
            ok:true,
            deleted:Number(result)||0
        });
    }catch(error){
        console.error("Admin delete orders error:",error);
        return res.status(500).json({error:"No se pudieron eliminar los pedidos."});
    }
}
