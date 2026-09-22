const WHATSAPP = "5491168070039";
const money = new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0});

function esc(value){
  return String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function orderCode(id){
  const raw=String(id||"").replaceAll("-","").toUpperCase();
  return raw ? `DP-${raw.slice(0,10)}` : "DP-—";
}
function statusInfo(data){
  const payment=String(data.status||"").toLowerCase();
  const prep=String(data.preparation_status||"nuevo").toLowerCase();

  if(prep==="cancelado") return {label:"CANCELADO",step:-1,kind:"bad"};
  if(payment==="revision") return {label:"PAGO EN REVISIÓN",step:1,kind:"warn",review:true};
  if(payment==="reembolsado") return {label:"REEMBOLSADO",step:-1,kind:"bad"};
  if(payment==="fallido") return {label:"PAGO NO COMPLETADO",step:0,kind:"bad"};
  if(payment!=="pagado") return {label:"ESPERANDO PAGO",step:0,kind:"warn"};
  if(prep==="entregado") return {label:"ENTREGADO",step:4,kind:"ok"};
  if(prep==="enviado") return {label:"ENVIADO",step:3,kind:"ok"};
  if(prep==="preparando") return {label:"PREPARANDO",step:2,kind:"ok"};
  return {label:"PAGO CONFIRMADO",step:1,kind:"ok"};
}
function renderProgress(info){
  const labels=["Pedido","Pagado","Preparando","Enviado","Entregado"];
  return labels.map((label,index)=>{
    const cls=info.step>=0 ? (index<info.step?"done":index===info.step?"active":"") : "";
    return `<div class="track-step ${cls}"><span class="track-dot">${index+1}</span><small>${label}</small></div>`;
  }).join("");
}
async function loadOrder(){
  const params=new URLSearchParams(location.search);
  const id=String(params.get("id")||"").trim();
  const tracking=String(params.get("tracking")||"").trim();
  const loading=document.getElementById("tracking-loading");
  const content=document.getElementById("tracking-content");
  const error=document.getElementById("tracking-error");
  const errorText=document.getElementById("tracking-error-text");

  loading.hidden=false; content.hidden=true; error.hidden=true;

  if(!id||!tracking){
    loading.hidden=true; error.hidden=false;
    errorText.textContent="El enlace de seguimiento está incompleto.";
    return;
  }

  try{
    const r=await fetch(`/api/order-status?id=${encodeURIComponent(id)}&tracking=${encodeURIComponent(tracking)}`,{
      headers:{Accept:"application/json"},cache:"no-store"
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(r.status===404?"El pedido no existe o este enlace ya no es válido.":data.error||"No se pudo consultar el pedido.");

    const info=statusInfo(data);
    document.getElementById("tracking-code").textContent=data.code||orderCode(data.id);
    document.getElementById("tracking-date").textContent=data.created_at
      ? new Date(data.created_at).toLocaleString("es-AR",{dateStyle:"long",timeStyle:"short"})
      : "";
    const status=document.getElementById("tracking-status");
    status.textContent=info.label;
    status.className=`status-pill ${info.kind||""}`;
    document.getElementById("tracking-progress").innerHTML=renderProgress(info);
    document.getElementById("tracking-review").hidden=!info.review;

    let units=0;
    const items=Array.isArray(data.items)?data.items:[];
    document.getElementById("tracking-items").innerHTML=items.map(item=>{
      const qty=Math.max(1,Number(item.quantity)||1);
      const unit=Number(item.unit_price)||0;
      units+=qty;
      return `<div class="tracking-item"><div><strong>${esc(item.name)}</strong><small>${qty} × ${esc(money.format(unit))}</small></div><strong>${esc(money.format(unit*qty))}</strong></div>`;
    }).join("") || '<div class="tracking-item"><div><strong>Sin detalle de productos</strong></div></div>';
    document.getElementById("tracking-units").textContent=`${units} ${units===1?"unidad":"unidades"}`;
    document.getElementById("tracking-total").textContent=money.format(Number(data.total)||0);

    const code=data.code||orderCode(data.id);
    document.getElementById("tracking-whatsapp").href=
      `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hola Dorado Artículos de Pesca, quiero consultar por mi pedido ${code}.`)}`;

    loading.hidden=true; content.hidden=false;
    document.title=`${code} | Seguimiento Dorado`;
  }catch(err){
    loading.hidden=true; error.hidden=false;
    errorText.textContent=err?.message||"No se pudo consultar el pedido.";
  }
}

document.getElementById("tracking-refresh")?.addEventListener("click",loadOrder);
document.getElementById("tracking-copy")?.addEventListener("click",async e=>{
  const button=e.currentTarget;
  const original=button.textContent;
  try{
    await navigator.clipboard.writeText(location.href);
    button.textContent="ENLACE COPIADO";
  }catch{
    button.textContent="COPIÁ EL ENLACE DEL NAVEGADOR";
  }
  setTimeout(()=>button.textContent=original,1800);
});
loadOrder();
