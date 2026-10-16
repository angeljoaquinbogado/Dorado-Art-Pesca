/* Web Push server-side. Nunca exponemos el service role ni el VAPID private key. */
import webpush from "web-push";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAID=new Set(["pagado","pagado_revisar_stock","pago_revisar_monto","pagado_cancelado_revisar"]);
function validConfig(){
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.DORADO_VAPID_PUBLIC_KEY && process.env.DORADO_VAPID_PRIVATE_KEY);
}
async function db(path,options={}){
  return fetch(process.env.SUPABASE_URL+path,{
    ...options,headers:{
      apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:"Bearer "+process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type":"application/json",Accept:"application/json",
      ...(options.headers||{})
    },signal:AbortSignal.timeout(6500)
  });
}
export async function sendAdminOrderPush(orderId){
  if(!validConfig()||!UUID.test(String(orderId||"")))return {sent:0,reason:"disabled"};
  const orderResponse=await db("/rest/v1/pedidos?id=eq."+encodeURIComponent(orderId)+"&select=id,total,estado,metodo_entrega&limit=1");
  if(!orderResponse.ok)throw Error("No se pudo consultar el pedido para push");
  const orders=await orderResponse.json();const order=orders?.[0];
  if(!order||!PAID.has(String(order.estado||"").toLowerCase()))return {sent:0,reason:"not-paid"};
  const eventType=order.estado==="pagado"?"paid":"review";
  const subResponse=await db("/rest/v1/admin_push_subscriptions?select=id,endpoint,p256dh,auth_key&limit=50");
  if(!subResponse.ok)throw Error("No se pudieron consultar las suscripciones push");
  const subscriptions=await subResponse.json();
  if(!Array.isArray(subscriptions)||!subscriptions.length)return {sent:0,reason:"no-subscriptions"};
  // El índice único evita notificaciones duplicadas de Checkout + webhook.
  const claimed=await db("/rest/v1/admin_order_push_events",{
    method:"POST",headers:{Prefer:"return=representation"},
    body:JSON.stringify({order_id:order.id,event_type:eventType})
  });
  if(claimed.status===409)return {sent:0,reason:"already-notified"};
  if(!claimed.ok)throw Error("No se pudo registrar la deduplicación push");
  webpush.setVapidDetails(
    "https://www.doradoarticulosdepesca.com.ar",
    process.env.DORADO_VAPID_PUBLIC_KEY,
    process.env.DORADO_VAPID_PRIVATE_KEY
  );
  const code="DP-"+String(order.id).replaceAll("-","").slice(0,10).toUpperCase();
  const amount=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0})
    .format(Number(order.total)||0);
  const status=order.estado==="pagado"?"Pago aprobado":"Pago recibido · revisar";
  const delivery=order.metodo_entrega==="retiro"?"Retiro en el local":"Entrega a coordinar";
  const payload=JSON.stringify({
    title:"DORADO · "+(eventType==="paid"?"Nuevo pedido":"Pedido para revisar"),
    body:code+" · "+amount+" · "+status+" · "+delivery,
    tag:"dorado-order-"+order.id+"-"+eventType,
    url:"/admin.html?tab=orders&pedido="+encodeURIComponent(order.id),
    orderCode:code
  });
  const settled=await Promise.allSettled(subscriptions.map(async item=>{
    try{
      await webpush.sendNotification({
        endpoint:item.endpoint,
        keys:{p256dh:item.p256dh,auth:item.auth_key}
      },payload,{TTL:3600,urgency:"high",timeout:6000});
      return true;
    }catch(error){
      if([404,410].includes(error?.statusCode)){
        await db("/rest/v1/admin_push_subscriptions?id=eq."+item.id,{method:"DELETE"}).catch(()=>{});
      }else console.error("WebPush delivery failed",{status:error?.statusCode||"network"});
      return false;
    }
  }));
  return {sent:settled.filter(x=>x.status==="fulfilled"&&x.value===true).length};
}
