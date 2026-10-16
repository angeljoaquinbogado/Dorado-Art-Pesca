/* Cartel público: usa solo promociones activadas por el administrador. */
(async function initDoradoPromotions(){
  const shell=document.getElementById("dorado-promo-strip");
  const rail=document.getElementById("dorado-promo-track");
  if(!shell||!rail)return;
  try{
    const response=await fetch("/api/public-config",{headers:{Accept:"application/json"},cache:"no-store"});
    if(!response.ok)return;
    const config=await response.json();
    const items=Array.isArray(config.promotions)?config.promotions.filter(p=>p&&p.title).slice(0,8):[];
    if(!items.length)return;
    function makeSet(duplicate){
      const set=document.createElement("div");
      set.className="dorado-promo-set";
      if(duplicate){set.setAttribute("aria-hidden","true");set.inert=true;}
      for(const promotion of items){
        const href=String(promotion.href||"");
        const el=document.createElement(href?"a":"span");
        el.className="dorado-promo-item";
        if(href){
          el.href=href;
          if(/^https:\/\//i.test(href)){el.target="_blank";el.rel="noopener noreferrer";}
          else if(href.startsWith("#"))el.target="_self";
        }
        const sparkle=document.createElement("span");
        sparkle.className="promo-spark";sparkle.textContent="✦";sparkle.setAttribute("aria-hidden","true");
        const title=document.createElement("strong");title.textContent=String(promotion.title);
        el.append(sparkle,title);
        if(promotion.detail){const detail=document.createElement("span");detail.className="promo-detail";detail.textContent=String(promotion.detail);el.append(detail);}
        if(href){const arrow=document.createElement("span");arrow.className="promo-arrow";arrow.textContent="↗";arrow.setAttribute("aria-hidden","true");el.append(arrow);}
        set.append(el);
      }
      return set;
    }
    rail.replaceChildren(makeSet(false),makeSet(true));
    shell.hidden=false;
  }catch(error){console.warn("No se pudieron cargar las promociones",error);}
})();
