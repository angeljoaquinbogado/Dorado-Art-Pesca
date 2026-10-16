/* Alta y baja de Web Push: solo usuarios administradores autenticados. */
import {isSameOriginRequest} from "./security.js";
const MAX_BODY=6000;
const allowedMethods=new Set(["GET","POST","DELETE"]);
const endpointValid=value=>{
  if(typeof value!=="string"||value.length<20||value.length>2048)return false;
  try{
    const u=new URL(value);
    const h=u.hostname.toLowerCase();
    if(u.protocol!=="https:"||u.username||u.password||u.port)return false;
    // Impide destinos internos/arbitrarios en peticiones push salientes.
    return h==="fcm.googleapis.com" ||
      h==="updates.push.services.mozilla.com" ||
      h.endsWith(".push.services.mozilla.com") ||
      h==="web.push.apple.com" || h.endsWith(".push.apple.com") ||
      h.endsWith(".notify.windows.com");
  }catch{return false;}
};
const keyValid=value=>typeof value==="string" && /^[a-zA-Z0-9_\-+/=]{8,400}$/.test(value);
const json=(res,status,body)=>res.status(status).json(body);
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  if(!allowedMethods.has(req.method)){res.setHeader("Allow","GET, POST, DELETE");return json(res,405,{error:"Método no permitido"});}
  if(req.method!=="GET"&&!isSameOriginRequest(req))return json(res,403,{error:"Origen no autorizado"});
  if(req.method!=="GET" && Number(req.headers["content-length"]||0)>MAX_BODY)return json(res,413,{error:"Solicitud demasiado grande"});
  const url=process.env.SUPABASE_URL,publicKey=process.env.SUPABASE_PUBLISHABLE_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!publicKey||!service)return json(res,503,{error:"Notificaciones no disponibles"});
  const token=String(req.headers.authorization||"").match(/^Bearer\s+(\S+)$/i)?.[1];
  if(!token||token.length>4096)return json(res,401,{error:"Iniciá sesión para gestionar las notificaciones"});
  try{
    const u=await fetch(url+"/auth/v1/user",{headers:{apikey:publicKey,Authorization:"Bearer "+token},signal:AbortSignal.timeout(6000)});
    if(!u.ok)return json(res,401,{error:"Sesión inválida"});
    const user=await u.json();
    if(!/^[0-9a-f-]{36}$/i.test(String(user.id||"")))return json(res,401,{error:"Sesión inválida"});
    const check=await fetch(url+"/rest/v1/admin_users?user_id=eq."+encodeURIComponent(user.id)+"&select=user_id&limit=1",{
      headers:{apikey:publicKey,Authorization:"Bearer "+token},signal:AbortSignal.timeout(6000)
    });
    if(!check.ok||!(await check.json())?.length)return json(res,403,{error:"Solo para administradores"});
    if(req.method==="GET"){
      return json(res,200,{
        available:Boolean(process.env.DORADO_VAPID_PUBLIC_KEY&&process.env.DORADO_VAPID_PRIVATE_KEY),
        publicKey:String(process.env.DORADO_VAPID_PUBLIC_KEY||"")
      });
    }
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const endpoint=String(body.endpoint||"");
    if(!endpointValid(endpoint))return json(res,400,{error:"Suscripción no válida"});
    const headers={apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json",Accept:"application/json"};
    if(req.method==="DELETE"){
      const result=await fetch(url+"/rest/v1/admin_push_subscriptions?endpoint=eq."+encodeURIComponent(endpoint)+"&user_id=eq."+encodeURIComponent(user.id),{
        method:"DELETE",headers,signal:AbortSignal.timeout(7000)
      });
      if(!result.ok)return json(res,502,{error:"No se pudo desactivar el dispositivo"});
      return json(res,200,{ok:true});
    }
    if(!process.env.DORADO_VAPID_PUBLIC_KEY||!process.env.DORADO_VAPID_PRIVATE_KEY)
      return json(res,503,{error:"El servidor de notificaciones no está configurado"});
    if(body.test===true){
      const rowsResponse=await fetch(url+"/rest/v1/admin_push_subscriptions?user_id=eq."+encodeURIComponent(user.id)+
        "&endpoint=eq."+encodeURIComponent(endpoint)+"&select=endpoint,p256dh,auth_key&limit=1",{
        headers,signal:AbortSignal.timeout(7000)
      });
      if(!rowsResponse.ok)return json(res,503,{error:"No se pudo encontrar el dispositivo"});
      const entry=(await rowsResponse.json())?.[0];
      if(!entry)return json(res,404,{error:"Primero activá las notificaciones en este dispositivo"});
      const {default:webpush}=await import("web-push");
      webpush.setVapidDetails("https://www.doradoarticulosdepesca.com.ar",
        process.env.DORADO_VAPID_PUBLIC_KEY,process.env.DORADO_VAPID_PRIVATE_KEY);
      try{
        await webpush.sendNotification({endpoint:entry.endpoint,keys:{p256dh:entry.p256dh,auth:entry.auth_key}},
          JSON.stringify({
            title:"DORADO · Notificación de prueba",
            body:"Todo listo. Cuando entre una compra confirmada recibirás el número, importe y estado del pedido.",
            tag:"dorado-admin-push-test",url:"/admin.html?tab=orders"
          }),{TTL:90,timeout:6000});
        return json(res,200,{ok:true,sent:true});
      }catch(error){
        console.error("Error prueba Web Push",String(error?.statusCode||"envío"));
        return json(res,502,{error:"El servicio push no aceptó la prueba. Revisá los permisos del dispositivo."});
      }
    }
    const p256dh=String(body.keys?.p256dh||""),auth=String(body.keys?.auth||"");
    if(!keyValid(p256dh)||!keyValid(auth))return json(res,400,{error:"Claves de suscripción inválidas"});
    const result=await fetch(url+"/rest/v1/admin_push_subscriptions?on_conflict=endpoint",{
      method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({user_id:user.id,endpoint,p256dh,auth_key:auth,updated_at:new Date().toISOString()}),
      signal:AbortSignal.timeout(7000)
    });
    if(!result.ok)return json(res,502,{error:"No se pudo registrar este dispositivo"});
    return json(res,200,{ok:true});
  }catch(error){
    console.error("Admin push endpoint failed",String(error?.message||"").slice(0,120));
    return json(res,503,{error:"No se pudieron gestionar las notificaciones. Probá nuevamente."});
  }
}
