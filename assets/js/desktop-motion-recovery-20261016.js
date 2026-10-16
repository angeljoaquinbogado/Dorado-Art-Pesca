/* Respaldo ligero para efectos de entrada y animaciones visibles en PC.
   Algunos equipos no actualizaban los IntersectionObserver tras recuperar foco,
   restaurar una pestaña o navegar con una rueda de scroll rápida. */
(function restoreDoradoDesktopMotion(){
  if(!window.matchMedia("(min-width:821px)").matches)return;
  let frame=0;
  const near=(el,pad=0)=>{
    const r=el.getBoundingClientRect();
    return r.width>0 && r.height>0 && r.bottom>=-pad && r.top<=innerHeight+pad;
  };
  const sync=()=>{
    frame=0;
    if(document.hidden)return;
    document.querySelectorAll(".motion-item:not(.motion-visible)").forEach(el=>{
      if(near(el,80))el.classList.add("motion-visible");
    });
    document.querySelectorAll("[data-perf-zone]").forEach(zone=>{
      const isNear=near(zone,180);
      zone.classList.toggle("perf-active",isNear);
      zone.classList.toggle("perf-paused",!isNear);
    });
  };
  const queue=()=>{if(!frame)frame=requestAnimationFrame(sync);};
  window.addEventListener("scroll",queue,{passive:true});
  window.addEventListener("resize",queue,{passive:true});
  window.addEventListener("focus",queue,{passive:true});
  window.addEventListener("pageshow",queue,{passive:true});
  document.addEventListener("visibilitychange",queue,{passive:true});
  queue();
})();
