(()=> {
  const setText=(id,value)=>{
    const el=document.getElementById(id);
    if(el&&value)el.textContent=value;
  };
  const rangesText=list=>(Array.isArray(list)?list:[])
    .map(pair=>Array.isArray(pair)&&pair.length===2?pair[0]+"–"+pair[1]:"")
    .filter(Boolean)
    .join(" y ");

  fetch("/api/public-config",{headers:{Accept:"application/json"}})
    .then(response=>response.ok?response.json():Promise.reject())
    .then(data=>{
      const b=data?.business||{};
      setText("legal-holder",b.legalHolder);
      setText("legal-tax-id",b.taxId);
      setText("legal-address",[b.address,b.area,b.province].filter(Boolean).join(", "));

      const hours=b.hours||{};
      const weekday=rangesText(hours.mon_fri);
      const sat=rangesText(hours.sat);
      const sun=rangesText(hours.sun);
      setText("legal-hours",
        "lunes a viernes "+(weekday||"consultar")+
        "; sábado "+(sat||"cerrado")+
        "; domingo "+(sun||"cerrado")
      );

      const digits=String(b.whatsapp||"").replace(/\D/g,"");
      const phone=document.getElementById("legal-phone");
      if(phone){
        if(b.phoneDisplay)phone.textContent=b.phoneDisplay;
        if(digits)phone.href="tel:+"+digits;
      }

      if(digits){
        document.querySelectorAll('a[href*="wa.me/"]').forEach(link=>{
          try{
            const url=new URL(link.href,location.href);
            const text=url.searchParams.get("text");
            link.href="https://wa.me/"+digits+(text?"?text="+encodeURIComponent(text):"");
          }catch{}
        });
      }

      if(b.mapsUrl){
        document.querySelectorAll('a[href*="maps.app.goo.gl"]').forEach(link=>{
          link.href=b.mapsUrl;
        });
      }
    })
    .catch(()=>{});
})();