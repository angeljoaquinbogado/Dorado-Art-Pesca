/* Marquesina promocional DORADO: sin mensajes inventados ni HTML dinámico.
   El administrador controla títulos, enlaces y activación. */
(async function mostrarPromocionesDorado(){
  const shell=document.getElementById("dorado-promo-strip");
  const track=document.getElementById("dorado-promo-track");
  if(!shell||!track)return;
  try{
    const response=await fetch("/api/public-config",{
      headers:{Accept:"application/json"},cache:"no-store"
    });
    if(!response.ok)return;
    const config=await response.json();
    const promotions=Array.isArray(config.promotions)
      ?config.promotions.filter(item=>item&&item.title).slice(0,8)
      :[];
    if(!promotions.length)return;
    const set=(duplicate)=>{
      const group=document.createElement("div");
      group.className="dorado-promo-set";
      if(duplicate){
        group.setAttribute("aria-hidden","true");
        group.inert=true;
      }
      promotions.forEach(item=>{
        const href=String(item.href||"").trim()||"#promociones";
        const anchor=document.createElement("a");
        anchor.className="dorado-promo-item";
        anchor.href=href;
        if(/^https:\/\//i.test(href)){
          anchor.target="_blank";
          anchor.rel="noopener noreferrer";
        }
        const sparkle=document.createElement("span");
        sparkle.className="promo-spark";
        sparkle.textContent="✦";
        sparkle.setAttribute("aria-hidden","true");
        const title=document.createElement("strong");
        title.textContent=String(item.title);
        anchor.append(sparkle,title);
        if(item.detail){
          const detail=document.createElement("span");
          detail.className="promo-detail";
          detail.textContent=String(item.detail);
          anchor.appendChild(detail);
        }
        const arrow=document.createElement("span");
        arrow.className="promo-arrow";
        arrow.textContent="↗";
        arrow.setAttribute("aria-hidden","true");
        anchor.appendChild(arrow);
        group.appendChild(anchor);
      });
      return group;
    };
    track.replaceChildren(set(false),set(true));
    shell.hidden=false;
  }catch(error){
    console.warn("No se pudieron cargar los avisos promocionales",error);
  }
})();