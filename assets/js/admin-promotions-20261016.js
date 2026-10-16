/* Editor de promociones separado de los ajustes generales para no sobrescribir cambios. */
(function configurarEditorPromociones(){
 const list=document.getElementById("promo-admin-list");
 const add=document.getElementById("promo-add"),save=document.getElementById("promo-save"),status=document.getElementById("promo-admin-message");
 if(!list||!add||!save||!status)return;
 let loaded=false,working=false;
 function notice(t,error=false){status.textContent=t;status.classList.toggle("is-error",error);}
 function linkValid(value){return !value||/^https:\/\/[a-z0-9]/i.test(value)||/^\/(?!\/)/.test(value)||/^#[a-z0-9_-]+$/i.test(value);}
 function row(data={}){
  const root=document.createElement("article");root.className="promo-admin-row";
  root.innerHTML=`<div class="promo-admin-row-header"><strong>Promoción</strong>
    <div class="promo-admin-row-buttons">
      <button type="button" class="secondary promo-up" aria-label="Subir promoción">↑</button>
      <button type="button" class="secondary promo-down" aria-label="Bajar promoción">↓</button>
      <button type="button" class="secondary promo-remove">ELIMINAR</button>
    </div></div>
    <div class="promo-admin-fields">
      <label>TÍTULO <input class="promo-title" maxlength="90" placeholder="Ej.: Ofertas de temporada"></label>
      <label>DESCRIPCIÓN (OPCIONAL) <input class="promo-detail" maxlength="125" placeholder="Ej.: Descubrí los productos seleccionados"></label>
      <label class="promo-wide">ENLACE (OPCIONAL) <input class="promo-link" maxlength="350" placeholder="#promociones o https://..."></label>
    </div>
    <label class="promo-enable"><input class="promo-enabled" type="checkbox"><span>Mostrar esta promoción en la tienda</span></label>`;
  root.querySelector(".promo-title").value=String(data.title||"");
  root.querySelector(".promo-detail").value=String(data.detail||"");
  root.querySelector(".promo-link").value=String(data.href||"");
  root.querySelector(".promo-enabled").checked=data.enabled===true;
  return root;
 }
 function sync(){
  const rows=[...list.querySelectorAll(".promo-admin-row")];
  add.disabled=rows.length>=8 || working;
  rows.forEach((item,index)=>{
   item.querySelector(".promo-admin-row-header strong").textContent="Promoción "+(index+1);
   item.querySelector(".promo-up").disabled=index===0||working;
   item.querySelector(".promo-down").disabled=index===rows.length-1||working;
  });
  if(!rows.length)list.innerHTML='<p class="promo-admin-empty">Todavía no hay promociones. Agregá una para empezar; el mensaje de la portada solo aparece cuando esté activo.</p>';
 }
 function paint(items){
  list.replaceChildren(...items.slice(0,8).map(row));sync();
 }
 function collect(){
  const out=[...list.querySelectorAll(".promo-admin-row")].map(el=>({
    title:el.querySelector(".promo-title").value.trim(),
    detail:el.querySelector(".promo-detail").value.trim(),
    href:el.querySelector(".promo-link").value.trim(),
    enabled:el.querySelector(".promo-enabled").checked
  }));
  for(const [i,p] of out.entries()){
   if(!p.title)throw new Error("Completá el título de la promoción "+(i+1)+".");
   if(!linkValid(p.href))throw new Error("El enlace de la promoción "+(i+1)+" debe empezar con https://, / o #.");
  }
  return out;
 }
 async function load(){
  if(working)return;
  try{
   notice("Cargando promociones…");
   const response=await sb("/rest/v1/site_settings?id=eq.1&select=promotions");
   const data=await response.json().catch(()=>[]);
   if(!response.ok)throw new Error("No se pudieron obtener las promociones.");
   paint(Array.isArray(data?.[0]?.promotions)?data[0].promotions:[]);
   loaded=true;notice("");
  }catch(error){notice(error.message||"Error cargando promociones.",true);}
 }
 add.addEventListener("click",async()=>{
  if(list.querySelectorAll(".promo-admin-row").length>=8)return;
  // El botón también funciona si todavía no se abrió la sección:
  // cargar los títulos existentes antes de crear uno nuevo.
  if(!loaded)await load();
  if(!loaded)return;
  const empty=list.querySelector(".promo-admin-empty");if(empty)empty.remove();
  const item=row({href:"#promociones"});list.append(item);sync();item.querySelector(".promo-title").focus();notice("Cambios pendientes de guardar.");
 });
 list.addEventListener("click",event=>{
  const btn=event.target.closest("button");
  const item=btn?.closest(".promo-admin-row");if(!item||working)return;
  if(btn.classList.contains("promo-remove"))item.remove();
  else if(btn.classList.contains("promo-up")&&item.previousElementSibling)item.parentNode.insertBefore(item,item.previousElementSibling);
  else if(btn.classList.contains("promo-down")&&item.nextElementSibling)item.parentNode.insertBefore(item.nextElementSibling,item);
  else return;
  sync();notice("Cambios pendientes de guardar.");
 });
 list.addEventListener("input",()=>{if(loaded)notice("Cambios pendientes de guardar.");});
 list.addEventListener("change",()=>{if(loaded)notice("Cambios pendientes de guardar.");});
 save.addEventListener("click",async()=>{
  if(working||!loaded)return;
  let promotions;
  try{promotions=collect();}catch(error){notice(error.message,true);return;}
  working=true;save.disabled=true;add.disabled=true;notice("Guardando…");
  try{
   const response=await sb("/rest/v1/site_settings?id=eq.1",{
    method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({promotions})
   });
   const data=await response.json().catch(()=>[]);
   if(!response.ok||!data.length)throw new Error("No se pudieron guardar las promociones.");
   paint(promotions);
   notice("Promociones guardadas. Los mensajes activos aparecen debajo del menú, en la portada.");
   showToast("Promociones actualizadas.");
  }catch(error){notice(error.message||"Error al guardar.",true);}
  finally{working=false;save.disabled=false;sync();}
 });
 document.querySelector('.tab[data-tab="settings"]')?.addEventListener("click",()=>{void load();});
})();
