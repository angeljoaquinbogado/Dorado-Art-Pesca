/* DORADO · Administrador: solo push y navegación. Sin cachear pedidos ni credenciales. */
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?.json()||{};}catch{}
  const url=typeof data.url==="string"&&data.url.startsWith("/admin.html")?data.url:"/admin.html?tab=orders";
  event.waitUntil(self.registration.showNotification(String(data.title||"DORADO · Nuevo pedido").slice(0,90),{
    body:String(data.body||"Entró un nuevo pedido. Abrí el panel para revisarlo.").slice(0,220),
    icon:"/assets/images/brand/logo-dorado.png",
    badge:"/assets/images/brand/favicon-32.png",
    tag:String(data.tag||"dorado-new-order").slice(0,150),
    data:{url},
    timestamp:Date.now(),
    renotify:false
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"/admin.html?tab=orders",self.location.origin);
  if(url.origin!==self.location.origin||url.pathname!=="/admin.html")return;
  event.waitUntil((async()=>{
    const clientsList=await clients.matchAll({type:"window",includeUncontrolled:true});
    const match=clientsList.find(c=>new URL(c.url).pathname==="/admin.html");
    if(match){await match.focus();await match.navigate(url.href);return;}
    await clients.openWindow(url.href);
  })());
});
