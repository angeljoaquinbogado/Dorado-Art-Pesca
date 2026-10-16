/* Notificaciones del dueño: contador de compras nuevas y Web Push PWA.
   Usa la sesión Supabase existente, sin guardar credenciales persistentes. */
(function doradoAdminNotifications(){
 const tab=document.querySelector('.tab[data-tab="orders"]');
 const badge=document.getElementById("admin-order-badge");
 const status=document.getElementById("admin-push-status");
 const enable=document.getElementById("admin-push-enable");
 const disable=document.getElementById("admin-push-disable");
 const install=document.getElementById("admin-pwa-install");
 if(!tab||!badge||!status||!enable||!disable)return;
 let started=false,busy=false,installPrompt=null;
 let latestSeen="",lastCount=0;
 const label=(str,tone="")=>{status.textContent=str;status.dataset.tone=tone;};
 const seenKey=()=> "dorado-paid-orders-seen-"+String(session?.user?.id||"anon");
 const isActive=()=>Boolean(session?.access_token && !document.getElementById("admin-app")?.classList.contains("hidden"));
 const money=new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0});
 function renderCount(n){
   lastCount=n;
   badge.hidden=n<1;
   badge.textContent=n>99?"99+":String(n);
   badge.title=n===1?"1 compra nueva":n+" compras nuevas";
   tab.setAttribute("aria-label",n>0?"Pedidos · "+n+" nuevos":"Pedidos");
   if("setAppBadge" in navigator){navigator.setAppBadge(n).catch(()=>{});}
   else if(!n&&"clearAppBadge" in navigator){navigator.clearAppBadge().catch(()=>{});}
 }
 function readSeen(){
   try{return localStorage.getItem(seenKey())||"";}catch{return "";}
 }
 function writeSeen(v){
   latestSeen=v;
   try{localStorage.setItem(seenKey(),v);}catch{}
 }
 const isPaid=o=>["pagado","pagado_revisar_stock","pago_revisar_monto","pagado_cancelado_revisar"].includes(String(o.estado||"").toLowerCase());
 async function poll({silent=false}={}){
   if(!isActive()||busy)return;
   busy=true;
   try{
     const response=await sb("/rest/v1/pedidos?select=id,created_at,estado,total&order=created_at.desc&limit=300");
     if(!response.ok)throw Error("No se pudieron leer los pedidos");
     const orders=(await response.json()).filter(isPaid);
     const latest=orders[0]?.created_at||new Date().toISOString();
     const saved=readSeen();
     // La primera sesión en un nuevo dispositivo comienza sin un historial
     // artificial de 300 compras pendientes.
     if(!saved){writeSeen(latest);renderCount(0);return;}
     const unseen=orders.filter(o=>String(o.created_at||"")>saved);
     renderCount(unseen.length);
     if(!silent&&unseen.length>0&&unseen.length>lastCount)showToast(
       unseen.length===1?"Entró un pedido nuevo":unseen.length+" pedidos nuevos");
   }catch(error){
     if(!silent)console.warn("Pedidos nuevos:",error?.message||error);
   }finally{busy=false;}
 }
 function acknowledge(){
   if(!isActive())return;
   // No ignorar pedidos llegados después: la marca se toma del último
   // conjunto consultado y NO de la hora local del dispositivo.
   let newest="";
   for(const o of pedidos||[]){
     if(isPaid(o)&&(!newest||o.created_at>newest))newest=o.created_at;
   }
   if(newest)writeSeen(newest);
   renderCount(0);
 }
 async function authFetch(method,body){
   await refreshSessionIfNeeded();
   const response=await fetch("/api/admin-push",{
     method,headers:{
       Authorization:"Bearer "+session.access_token,
       Accept:"application/json",
       ...(body?{"Content-Type":"application/json"}:{})
     },
     ...(body?{body:JSON.stringify(body)}:{}),
     cache:"no-store"
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(String(data.error||"No se pudo gestionar el dispositivo"));
   return data;
 }
 function toBytes(value){
   const safe=String(value||"").replace(/-/g,"+").replace(/_/g,"/");
   const padded=safe.padEnd(Math.ceil(safe.length/4)*4,"=");
   return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
 }
 async function registration(){
   if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))
     throw Error("Este navegador no admite avisos push. En iPhone usá Safari e instalá el panel primero.");
   return navigator.serviceWorker.register("/admin-sw.js",{scope:"/admin.html",updateViaCache:"none"});
 }
 function syncButtons(subscribed){
   enable.hidden=subscribed;
   disable.hidden=!subscribed;
 }
 async function refreshPushState(){
   if(!isActive())return;
   try{
     const config=await authFetch("GET");
     if(!config.available){label("Las notificaciones todavía no están configuradas en el servidor.","error");enable.disabled=true;return;}
     const reg=await registration();
     const sub=await reg.pushManager.getSubscription();
     syncButtons(Boolean(sub));
     enable.disabled=false;
     if(sub)label("Notificaciones activadas en este dispositivo.","success");
     else label("Activá los avisos para recibir compras incluso con el panel cerrado.");
   }catch(error){
     label(error?.message||"No se pudo comprobar el permiso de notificaciones.","error");
   }
 }
 enable.addEventListener("click",async()=>{
   if(!isActive())return;
   // Solicitar permiso directamente desde el gesto, requisito de iOS/Chrome.
   let permission;
   try{permission=Notification.requestPermission();}
   catch(error){label("Instalá la app del panel y permití las notificaciones.","error");return;}
   enable.disabled=true;
   try{
     if(await permission!=="granted")throw Error("Permiso denegado. Habilitá notificaciones de DORADO en los ajustes del navegador.");
     const config=await authFetch("GET");
     if(!config.available||!config.publicKey)throw Error("El servidor todavía no puede enviar avisos.");
     const reg=await registration();
     let sub=await reg.pushManager.getSubscription();
     if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:toBytes(config.publicKey)});
     const json=sub.toJSON();
     await authFetch("POST",{endpoint:json.endpoint,keys:json.keys});
     syncButtons(true);
     label("Listo. Este celular recibirá pedidos confirmados con número e importe.","success");
   }catch(error){label(error?.message||"No pudimos activar los avisos.","error");}
   finally{enable.disabled=false;}
 });
 async function deactivate(){
   if(!("serviceWorker" in navigator))return;
   const reg=await navigator.serviceWorker.getRegistration("/admin.html");
   const sub=await reg?.pushManager?.getSubscription();
   if(sub){
     await authFetch("DELETE",{endpoint:sub.endpoint});
     await sub.unsubscribe();
   }
   syncButtons(false);
   label("Notificaciones desactivadas en este dispositivo.");
 }
 disable.addEventListener("click",async()=>{
   disable.disabled=true;
   try{await deactivate();}catch(e){label(e?.message||"No se pudo desactivar.","error");}
   finally{disable.disabled=false;}
 });
 window.doradoDeactivatePush=async()=>{try{await deactivate();}catch{}};
 window.addEventListener("beforeinstallprompt",event=>{
   event.preventDefault();installPrompt=event;
   if(install)install.hidden=false;
 });
 install?.addEventListener("click",async()=>{
   if(installPrompt){
     await installPrompt.prompt();
     installPrompt=null;return;
   }
   const ios=/iPhone|iPad|iPod/.test(navigator.userAgent);
   label(ios
     ?"iPhone: abrí Safari → Compartir → Añadir a pantalla de inicio. Después abrí DORADO Admin desde el ícono."
     :"Chrome Android: menú ⋮ → Instalar aplicación o Agregar a pantalla principal. Luego abrí DORADO Admin desde el ícono.");
 });
 tab.addEventListener("click",()=>{
   // La sección Pedidos carga su lista de forma asíncrona.
   window.setTimeout(async()=>{await poll({silent:true});acknowledge();},700);
 });
 async function openDeepLink(){
   const query=new URLSearchParams(location.search);
   if(query.get("tab")!=="orders")return;
   tab.click();
   const id=String(query.get("pedido")||"");
   if(id){
     try{
       await loadOrders();
       const match=pedidos.find(o=>String(o.id)===id);
       if(match)openOrder(match);
     }catch{}
   }
   history.replaceState(null,"","/admin.html");
 }
 function start(){
   if(started||!isActive())return;
   started=true;
   void poll({silent:true});
   void refreshPushState();
   void openDeepLink();
   window.setInterval(()=>{if(isActive()&&!document.hidden)void poll({silent:true});},20000);
   document.addEventListener("visibilitychange",()=>{if(!document.hidden&&isActive())void poll({silent:true});});
 }
 window.addEventListener("dorado:admin-ready",start);
 if(isActive())start();
})();
