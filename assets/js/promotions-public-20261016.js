/* Rotación de mensajes del administrador en la píldora de la portada.
   Cada título sin URL específica enlaza a todos los productos marcados. */
(async function initDoradoPromotions(){
  const badge=document.getElementById("dorado-hero-promo");
  const message=document.getElementById("dorado-hero-promo-title");
  const link=document.getElementById("dorado-hero-promo-link");
  const fallback=document.getElementById("dorado-hero-default");
  if(!badge||!message||!link||!fallback)return;
  try{
    const response=await fetch("/api/public-config",{headers:{Accept:"application/json"},cache:"no-store"});
    if(!response.ok)return;
    const config=await response.json();
    const promotions=Array.isArray(config.promotions)?config.promotions.filter(p=>p&&p.title).slice(0,8):[];
    if(!promotions.length)return;
    let index=0;
    function render(){
      const item=promotions[index];
      const href=String(item.href||"").trim()||"#promociones";
      message.textContent=String(item.title);
      link.href=href;
      link.title=String(item.detail||"Ver los productos en promoción");
      if(/^https:\/\//i.test(href)){link.target="_blank";link.rel="noopener noreferrer";}
      else{link.removeAttribute("target");link.removeAttribute("rel");}
      fallback.hidden=true;
      link.hidden=false;
      badge.classList.add("has-promotion");
      badge.classList.remove("promo-switching");
    }
    render();
    if(promotions.length>1){
      window.setInterval(()=>{
        if(document.hidden)return;
        const reduced=window.doradoPrefersReducedMotion?.()??window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if(reduced){index=(index+1)%promotions.length;render();return;}
        badge.classList.add("promo-switching");
        window.setTimeout(()=>{index=(index+1)%promotions.length;render();},200);
      },5200);
    }
  }catch(error){console.warn("No se pudieron cargar las promociones",error);}
})();