/* Marquesina promocional DORADO: sin mensajes inventados ni HTML dinámico.
   El administrador controla títulos y enlaces. */
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
        const title=document.createElement("strong");
        title.textContent=String(item.title).toLocaleUpperCase("es-AR");
        anchor.append(title);
        group.appendChild(anchor);
      });
      return group;
    };
    track.dataset.single=promotions.length===1?"true":"false";
    track.replaceChildren(set(false),set(true));
    shell.hidden=false;
    // El recorrido equivale exactamente al ancho del menú flotante,
    // también cuando pasa a su versión compacta al bajar.
    const updateWidth=()=>{
      const width=Math.round(shell.getBoundingClientRect().width);
      if(width>0)track.style.setProperty("--dorado-promo-width",width+"px");
    };
    updateWidth();
    if("ResizeObserver" in window){
      const observer=new ResizeObserver(updateWidth);
      observer.observe(shell);
    }else{
      window.addEventListener("resize",updateWidth,{passive:true});
    }
  }catch(error){
    console.warn("No se pudieron cargar los avisos promocionales",error);
  }
})();