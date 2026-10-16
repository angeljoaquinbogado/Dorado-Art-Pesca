/* Preferencia de movimiento local: sistema por defecto, anulación explícita
   cuando la persona elige "Animadas" o "Reducidas". */
(function(){
  const KEY="doradoStoreMotionPreference";
  const choices=new Set(["system","on","off"]);
  let preference="system";
  try{const saved=localStorage.getItem(KEY);if(choices.has(saved))preference=saved;}catch{}
  const media=window.matchMedia("(prefers-reduced-motion: reduce)");
  const isReduced=()=>preference==="off" || (preference==="system" && media.matches);
  const apply=()=>{
    document.documentElement.dataset.storeMotion=preference;
    document.querySelectorAll("[data-store-motion-choice]").forEach(button=>{
      const selected=button.dataset.storeMotionChoice===preference;
      button.classList.toggle("active",selected);
      button.setAttribute("aria-pressed",String(selected));
    });
    const status=document.getElementById("dorado-motion-status");
    if(status){
      status.textContent=preference==="off"?"Movimiento reducido para mayor comodidad."
        :preference==="on"?"Animaciones activadas en esta página."
        :media.matches?"Windows o tu navegador solicitaron reducir el movimiento. Elegí «Animadas» para activarlas aquí."
        :"Animaciones según la configuración del dispositivo.";
    }
  };
  window.doradoPrefersReducedMotion=()=>isReduced();
  window.addEventListener("DOMContentLoaded",()=>{
    apply();
    document.querySelectorAll("[data-store-motion-choice]").forEach(button=>{
      button.addEventListener("click",()=>{
        const next=button.dataset.storeMotionChoice;
        if(!choices.has(next)||preference===next)return;
        preference=next;
        try{localStorage.setItem(KEY,next);}catch{}
        apply();
        // Reiniciar las animaciones de entrada desde su estado inicial.
        location.reload();
      });
    });
  });
  if(media.addEventListener)media.addEventListener("change",apply);
  apply();
})();