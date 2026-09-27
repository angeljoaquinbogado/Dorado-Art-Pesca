const SESSION_KEY = "doradoAdminSession";
let CONFIG = null;
let session = null;
let productos = [];
let pedidos = [];
let cupones = [];
let categorias = [];
let selectedCategories = new Set();
let selectedOrders = new Set();
let productGalleryDraft = [];
let refreshPromise = null;
let recoveryAccessToken = "";
let recoveryRefreshToken = "";

const money = new Intl.NumberFormat("es-AR", {
    style:"currency",
    currency:"ARS",
    maximumFractionDigits:0
});

function orderCode(id){
    const raw=String(id||"").replaceAll("-","").toUpperCase();
    return raw ? `DP-${raw.slice(0,10)}` : "DP-—";
}

function orderPaymentGroup(status){
    const value=String(status||"").toLowerCase();
    if(value==="pagado")return "pagado";
    if(["pagado_revisar_stock","pago_revisar_monto"].includes(value))return "revision";
    if(["pendiente","pago_pendiente","error_pago"].includes(value))return "pendiente";
    if(["pago_rechazado","pago_cancelado","reembolsado","contracargo"].includes(value))return "fallido";
    return value||"pendiente";
}

function orderStatusLabel(status){
    const value=String(status||"pendiente").toLowerCase();
    const labels={
        pagado:"PAGADO",
        pagado_revisar_stock:"PAGADO · REVISAR STOCK",
        pago_revisar_monto:"PAGO · REVISAR MONTO",
        pendiente:"PENDIENTE",
        pago_pendiente:"PAGO PENDIENTE",
        error_pago:"ERROR AL INICIAR PAGO",
        pago_rechazado:"PAGO RECHAZADO",
        pago_cancelado:"PAGO CANCELADO",
        reembolsado:"REEMBOLSADO",
        contracargo:"CONTRACARGO"
    };
    return labels[value]||value.toUpperCase().replaceAll("_"," ");
}

function trackingLink(order){
    const id=String(order?.id||"").trim();
    const token=String(order?.tracking_token||"").trim();
    return id&&token
        ? `${location.origin}/pedido.html?id=${encodeURIComponent(id)}&tracking=${encodeURIComponent(token)}`
        : "";
}

function safeHttpsUrl(value){
    try{
        const url=new URL(String(value||"").trim());
        return url.protocol==="https:"?url.toString():"";
    }catch{
        return "";
    }
}

function shippingStatusLabel(value){
    const status=String(value||"pendiente").toLowerCase();
    const labels={pendiente:"PENDIENTE",despachado:"DESPACHADO",en_transito:"EN TRÁNSITO",en_distribucion:"EN DISTRIBUCIÓN",entregado:"ENTREGADO",incidencia:"INCIDENCIA"};
    return labels[status]||"PENDIENTE";
}

function esc(value){
    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function msg(id, text="", type="error"){
    const el=document.getElementById(id);
    if(!el)return;
    el.textContent=text;
    el.className=`message ${text ? "show" : ""} ${type}`;
}

function icon(name){
    const icons={
        edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
        trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
        eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg>',
        check:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
        alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></svg>'
    };
    return icons[name]||'';
}

function showToast(text,type="ok"){
    const wrap=document.getElementById("admin-toast");
    if(!wrap)return;
    wrap.innerHTML=`<span class="toast-icon">${icon(type==="error"?"alert":"check")}</span><span>${esc(text)}</span>`;
    wrap.className=`admin-toast show ${type}`;
    clearTimeout(showToast._timer);
    showToast._timer=setTimeout(()=>wrap.classList.remove("show"),3200);
}

function confirmAction({title="Confirmar acción",text="¿Querés continuar?",confirmText="CONFIRMAR",danger=false}={}){
    return new Promise(resolve=>{
        const modal=document.getElementById("confirm-modal");
        const titleEl=document.getElementById("confirm-title");
        const textEl=document.getElementById("confirm-text");
        const yes=document.getElementById("confirm-yes");
        const no=document.getElementById("confirm-no");
        titleEl.textContent=title;
        textEl.textContent=text;
        yes.textContent=confirmText;
        yes.className=danger?"danger solid":"primary";
        modal.classList.add("active");
        modal.setAttribute("aria-hidden","false");
        const finish=value=>{
            modal.classList.remove("active");
            modal.setAttribute("aria-hidden","true");
            yes.onclick=null;no.onclick=null;
            resolve(value);
        };
        yes.onclick=()=>finish(true);
        no.onclick=()=>finish(false);
        modal.onclick=e=>{if(e.target===modal)finish(false)};
    });
}

function resolveAdminImage(src){
    const value=String(src||"").trim();
    const legacy={
        "logo-2.PNG":"assets/images/brand/logo-dorado-640.webp",
        "/logo-2.PNG":"assets/images/brand/logo-dorado-640.webp",
        "logo.PNG":"assets/images/brand/logo-dorado-640.webp",
        "/logo.PNG":"assets/images/brand/logo-dorado-640.webp",
        "logo.jpg":"assets/images/brand/logo-dorado-640.webp",
        "/logo.jpg":"assets/images/brand/logo-dorado-640.webp",
        "auriculares 2.PNG":"assets/images/brand/logo-dorado-640.webp",
        "/auriculares 2.PNG":"assets/images/brand/logo-dorado-640.webp",
        "assets/images/brand/logo-dorado-640.webp":"assets/images/brand/logo-dorado-640.webp",
        "/assets/images/brand/logo-dorado-640.webp":"assets/images/brand/logo-dorado-640.webp",
        "assets/images/brand/logo-dorado-640.webp":"assets/images/brand/logo-dorado-640.webp",
        "/assets/images/brand/logo-dorado-640.webp":"assets/images/brand/logo-dorado-640.webp"
    };
    return legacy[value]||value||"assets/images/brand/logo-dorado-640.webp";
}

function productGalleryUrls(product){
    const raw=Array.isArray(product?.imagenes)?product.imagenes:[];
    const values=[...raw];
    if(product?.imagen)values.unshift(product.imagen);
    return [...new Set(values.map(x=>String(x||"").trim()).filter(Boolean))];
}

function releaseDraftPreviews(){
    productGalleryDraft.forEach(item=>{
        if(item.type==="file"&&item.preview){
            try{URL.revokeObjectURL(item.preview);}catch{}
        }
    });
}

function resetProductGallery(product=null){
    releaseDraftPreviews();
    productGalleryDraft=productGalleryUrls(product).map((url,index)=>({
        key:`url-${index}-${crypto.randomUUID()}`,
        type:"url",
        url,
        preview:resolveAdminImage(url),
        file:null,
        name:"Imagen guardada"
    }));
    renderProductGallery();
}

function renderProductGallery(){
    const wrap=document.getElementById("product-gallery-preview");
    const empty=document.getElementById("product-gallery-empty");
    if(!wrap)return;

    wrap.querySelectorAll(".gallery-admin-item").forEach(el=>el.remove());

    if(!productGalleryDraft.length){
        if(empty)empty.hidden=false;
        return;
    }
    if(empty)empty.hidden=true;

    productGalleryDraft.forEach((item,index)=>{
        const card=document.createElement("div");
        card.className=`gallery-admin-item ${index===0?"is-primary":""}`;
        card.dataset.key=item.key;
        card.innerHTML=`
            ${index===0?'<span class="gallery-admin-primary">PRINCIPAL</span>':""}
            <div class="gallery-admin-image">
                <img src="${esc(item.preview||item.url||"")}" alt="Imagen ${index+1} del producto" loading="lazy" decoding="async">
            </div>
            <div class="gallery-admin-actions">
                <button type="button" data-gallery-action="primary" ${index===0?"disabled":""}>PRINCIPAL</button>
                <button type="button" data-gallery-action="left" ${index===0?"disabled":""}>←</button>
                <button type="button" data-gallery-action="right" ${index===productGalleryDraft.length-1?"disabled":""}>→</button>
                <button type="button" class="gallery-remove" data-gallery-action="remove">QUITAR</button>
            </div>
            <div class="gallery-admin-file-name">${esc(item.name||"Imagen")}</div>
        `;

        card.querySelectorAll("[data-gallery-action]").forEach(button=>{
            button.addEventListener("click",()=>{
                const action=button.dataset.galleryAction;
                if(action==="remove"){
                    const [removed]=productGalleryDraft.splice(index,1);
                    if(removed?.type==="file"&&removed.preview){
                        try{URL.revokeObjectURL(removed.preview);}catch{}
                    }
                }else if(action==="primary"){
                    const [picked]=productGalleryDraft.splice(index,1);
                    productGalleryDraft.unshift(picked);
                }else if(action==="left"&&index>0){
                    [productGalleryDraft[index-1],productGalleryDraft[index]]=
                        [productGalleryDraft[index],productGalleryDraft[index-1]];
                }else if(action==="right"&&index<productGalleryDraft.length-1){
                    [productGalleryDraft[index+1],productGalleryDraft[index]]=
                        [productGalleryDraft[index],productGalleryDraft[index+1]];
                }
                renderProductGallery();
            });
        });

        wrap.appendChild(card);
    });
}

const PRODUCT_IMAGE_TYPES=["image/jpeg","image/png","image/webp"];
const PRODUCT_IMAGE_SOURCE_MAX=50*1024*1024;
const PRODUCT_IMAGE_UPLOAD_TARGET=4.5*1024*1024;
const PRODUCT_IMAGE_MAX_SIDE=2200;

function validateImageFile(file){
    if(!file)throw new Error("Archivo vacío.");
    if(!PRODUCT_IMAGE_TYPES.includes(file.type)){
        throw new Error(`${file.name}: formato no compatible. Usá JPG, PNG o WebP.`);
    }
    if(file.size>PRODUCT_IMAGE_SOURCE_MAX){
        throw new Error(`${file.name}: supera 50 MB.`);
    }
}

function canvasBlob(canvas,type,quality){
    return new Promise(resolve=>canvas.toBlob(resolve,type,quality));
}

async function loadImageForCanvas(file){
    if("createImageBitmap" in window){
        try{
            const bitmap=await createImageBitmap(file);
            return {
                source:bitmap,
                width:bitmap.width,
                height:bitmap.height,
                close:()=>bitmap.close?.()
            };
        }catch{}
    }

    return await new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(file);
        const img=new Image();
        img.onload=()=>resolve({
            source:img,
            width:img.naturalWidth||img.width,
            height:img.naturalHeight||img.height,
            close:()=>URL.revokeObjectURL(url)
        });
        img.onerror=()=>{
            URL.revokeObjectURL(url);
            reject(new Error(`${file.name}: no se pudo leer la imagen.`));
        };
        img.src=url;
    });
}

async function optimizeImageForUpload(file){
    validateImageFile(file);

    /* Los archivos chicos se suben sin recomprimir para no degradarlos. */
    if(file.size<=PRODUCT_IMAGE_UPLOAD_TARGET)return file;

    const image=await loadImageForCanvas(file);

    try{
        const largest=Math.max(image.width,image.height);
        const scale=Math.min(1,PRODUCT_IMAGE_MAX_SIDE/largest);
        const width=Math.max(1,Math.round(image.width*scale));
        const height=Math.max(1,Math.round(image.height*scale));

        const canvas=document.createElement("canvas");
        canvas.width=width;
        canvas.height=height;

        const ctx=canvas.getContext("2d",{alpha:false});
        if(!ctx)throw new Error(`${file.name}: no se pudo optimizar.`);

        ctx.fillStyle="#fff";
        ctx.fillRect(0,0,width,height);
        ctx.drawImage(image.source,0,0,width,height);

        let blob=null;
        for(const quality of [0.88,0.78,0.68,0.58]){
            blob=await canvasBlob(canvas,"image/webp",quality);
            if(blob&&blob.size<=PRODUCT_IMAGE_UPLOAD_TARGET)break;
        }

        if(!blob)throw new Error(`${file.name}: no se pudo optimizar.`);
        if(blob.size>5*1024*1024){
            throw new Error(`${file.name}: sigue siendo demasiado pesada después de optimizarla.`);
        }

        const base=String(file.name||"producto")
            .replace(/\.[^.]+$/,"")
            .replace(/[^a-zA-Z0-9._-]+/g,"-")
            .slice(0,80)||"producto";

        return new File([blob],`${base}.webp`,{
            type:"image/webp",
            lastModified:Date.now()
        });
    }finally{
        image.close?.();
    }
}

function addFilesToGallery(files){
    const list=Array.from(files||[]);
    if(!list.length)return;

    const rejected=[];
    let added=0;

    for(const file of list){
        try{
            validateImageFile(file);

            const duplicate=productGalleryDraft.some(item=>
                item.type==="file" &&
                item.file?.name===file.name &&
                item.file?.size===file.size &&
                item.file?.lastModified===file.lastModified
            );

            if(duplicate)continue;

            productGalleryDraft.push({
                key:`file-${crypto.randomUUID()}`,
                type:"file",
                url:"",
                preview:URL.createObjectURL(file),
                file,
                name:file.name
            });
            added++;
        }catch(error){
            rejected.push(error.message||`${file.name}: no se pudo agregar.`);
        }
    }

    renderProductGallery();

    if(rejected.length){
        showToast(
            `${added?`${added} imagen${added===1?" agregada":"es agregadas"}. `:""}${rejected.join(" ")}`,
            "error"
        );
    }else if(added>1){
        showToast(`${added} imágenes agregadas a la galería.`);
    }
}

function addUrlToGallery(){
    const input=document.getElementById("product-image");
    const value=String(input?.value||"").trim();
    if(!value)return;
    if(productGalleryDraft.some(item=>String(item.url||"").trim()===value)){
        if(input)input.value="";
        return;
    }
    productGalleryDraft.push({
        key:`url-${crypto.randomUUID()}`,
        type:"url",
        url:value,
        preview:resolveAdminImage(value),
        file:null,
        name:"Imagen por URL"
    });
    if(input)input.value="";
    renderProductGallery();
}

async function loadConfig(){
    if(CONFIG)return CONFIG;
    const r=await fetch("/api/public-config",{headers:{Accept:"application/json"}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||"No se pudo cargar la configuración.");
    CONFIG=d;
    return d;
}

function saveSession(data){
    session={
        access_token:data.access_token,
        refresh_token:data.refresh_token,
        user:data.user,
        expires_at:Date.now()+(Number(data.expires_in||3600)*1000)
    };
    sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));
}

function readSession(){
    try{
        const value=JSON.parse(sessionStorage.getItem(SESSION_KEY));
        if(value?.access_token&&value?.refresh_token&&value?.user)return value;
    }catch{}
    return null;
}

async function refreshSessionIfNeeded(){
    if(!session)throw new Error("Sesión no iniciada.");
    if((session.expires_at||0)-Date.now()>60000)return session;
    if(refreshPromise)return refreshPromise;

    refreshPromise=(async()=>{
        const cfg=await loadConfig();
        const currentRefreshToken=session?.refresh_token;
        if(!currentRefreshToken)throw new Error("La sesión venció. Volvé a ingresar.");

        const r=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,{
            method:"POST",
            headers:{
                apikey:cfg.supabasePublishableKey,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({refresh_token:currentRefreshToken})
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error("La sesión venció. Volvé a ingresar.");
        saveSession(d);
        return session;
    })();

    try{return await refreshPromise;}
    finally{refreshPromise=null;}
}

async function sb(path, options={}){
    await refreshSessionIfNeeded();
    const cfg=await loadConfig();
    const headers={
        apikey:cfg.supabasePublishableKey,
        Authorization:`Bearer ${session.access_token}`,
        Accept:"application/json",
        ...(options.headers||{})
    };
    if(options.body && !(options.body instanceof Blob) && !(options.body instanceof File)){
        headers["Content-Type"]="application/json";
    }
    const r=await fetch(`${cfg.supabaseUrl}${path}`,{...options,headers});
    if(r.status===401){
        void logout(false);
        throw new Error("La sesión venció.");
    }
    return r;
}

async function verifyAdmin(){
    const r=await sb(`/rest/v1/admin_users?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id`);
    const d=await r.json().catch(()=>[]);
    return r.ok&&Array.isArray(d)&&d.length>0;
}

async function login(email,password){
    const cfg=await loadConfig();
    const r=await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`,{
        method:"POST",
        headers:{
            apikey:cfg.supabasePublishableKey,
            "Content-Type":"application/json"
        },
        body:JSON.stringify({email,password})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error("Email o contraseña incorrectos.");
    saveSession(d);

    if(!await verifyAdmin()){
        await logout(false);
        throw new Error("Esta cuenta no está autorizada como administrador.");
    }
}

function setAuthView(view){
    const loginForm=document.getElementById("login-form");
    const requestForm=document.getElementById("recovery-request-form");
    const updateForm=document.getElementById("recovery-update-form");

    loginForm?.classList.toggle("hidden",view!=="login");
    requestForm?.classList.toggle("hidden",view!=="request");
    updateForm?.classList.toggle("hidden",view!=="update");
}

function recoveryRedirectUrl(){
    return `${location.origin}${location.pathname}`;
}

function clearRecoveryUrl(){
    if(location.hash){
        history.replaceState({},document.title,`${location.pathname}${location.search}`);
    }
}

async function requestPasswordRecovery(email){
    const cfg=await loadConfig();
    const redirectTo=recoveryRedirectUrl();
    const r=await fetch(
        `${cfg.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
        {
            method:"POST",
            headers:{
                apikey:cfg.supabasePublishableKey,
                "Content-Type":"application/json"
            },
            body:JSON.stringify({email})
        }
    );

    if(r.status===429){
        throw new Error("Demasiados intentos. Esperá unos minutos antes de volver a solicitar el enlace.");
    }

    if(!r.ok){
        throw new Error("No se pudo iniciar la recuperación. Revisá la configuración de autenticación e intentá nuevamente.");
    }

    return true;
}

function recoveryParamsFromUrl(){
    if(!location.hash)return null;
    const params=new URLSearchParams(location.hash.slice(1));
    const type=String(params.get("type")||"");
    const error=String(params.get("error_description")||params.get("error")||"");

    if(type!=="recovery"&&!error)return null;

    return {
        type,
        error,
        accessToken:String(params.get("access_token")||""),
        refreshToken:String(params.get("refresh_token")||"")
    };
}

async function verifyRecoveryAdmin(accessToken){
    const cfg=await loadConfig();

    const userResponse=await fetch(`${cfg.supabaseUrl}/auth/v1/user`,{
        headers:{
            apikey:cfg.supabasePublishableKey,
            Authorization:`Bearer ${accessToken}`
        }
    });
    const user=await userResponse.json().catch(()=>({}));
    if(!userResponse.ok||!user?.id){
        throw new Error("El enlace de recuperación no es válido o ya venció.");
    }

    const adminResponse=await fetch(
        `${cfg.supabaseUrl}/rest/v1/admin_users?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`,
        {
            headers:{
                apikey:cfg.supabasePublishableKey,
                Authorization:`Bearer ${accessToken}`,
                Accept:"application/json"
            }
        }
    );
    const rows=await adminResponse.json().catch(()=>[]);

    if(!adminResponse.ok||!Array.isArray(rows)||rows.length===0){
        throw new Error("Este enlace no corresponde a una cuenta administradora autorizada.");
    }

    return user;
}

async function handleRecoveryCallback(){
    const params=recoveryParamsFromUrl();
    if(!params)return false;

    clearRecoveryUrl();
    sessionStorage.removeItem(SESSION_KEY);
    session=null;

    if(params.error){
        setAuthView("login");
        msg("login-message","El enlace de recuperación no es válido o ya venció.");
        return true;
    }

    if(params.type!=="recovery"||!params.accessToken){
        setAuthView("login");
        msg("login-message","El enlace de recuperación está incompleto. Solicitá uno nuevo.");
        return true;
    }

    try{
        await verifyRecoveryAdmin(params.accessToken);
        recoveryAccessToken=params.accessToken;
        recoveryRefreshToken=params.refreshToken;
        setAuthView("update");
        document.getElementById("recovery-new-password")?.focus();
    }catch(error){
        recoveryAccessToken="";
        recoveryRefreshToken="";
        setAuthView("login");
        msg("login-message",error?.message||"No se pudo validar el enlace de recuperación.");
    }

    return true;
}

async function updateRecoveredPassword(password){
    if(!recoveryAccessToken){
        throw new Error("La sesión de recuperación venció. Solicitá un nuevo enlace.");
    }

    const cfg=await loadConfig();
    const r=await fetch(`${cfg.supabaseUrl}/auth/v1/user`,{
        method:"PUT",
        headers:{
            apikey:cfg.supabasePublishableKey,
            Authorization:`Bearer ${recoveryAccessToken}`,
            "Content-Type":"application/json"
        },
        body:JSON.stringify({password})
    });

    const d=await r.json().catch(()=>({}));
    if(!r.ok){
        const detail=String(d?.msg||d?.message||d?.error_description||"").trim();
        if(r.status===422&&detail){
            throw new Error(detail);
        }
        throw new Error("No se pudo actualizar la contraseña. Revisá los requisitos de seguridad e intentá nuevamente.");
    }

    try{
        await fetch(`${cfg.supabaseUrl}/auth/v1/logout`,{
            method:"POST",
            headers:{
                apikey:cfg.supabasePublishableKey,
                Authorization:`Bearer ${recoveryAccessToken}`
            }
        });
    }catch{}

    recoveryAccessToken="";
    recoveryRefreshToken="";
    return true;
}

async function logout(reload=true){
    const previous=session;
    session=null;
    sessionStorage.removeItem(SESSION_KEY);

    if(previous?.access_token){
        try{
            const cfg=await loadConfig();
            await fetch(`${cfg.supabaseUrl}/auth/v1/logout`,{
                method:"POST",
                headers:{
                    apikey:cfg.supabasePublishableKey,
                    Authorization:`Bearer ${previous.access_token}`
                }
            });
        }catch{}
    }

    if(reload)location.reload();
}

function showApp(){
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("admin-app").classList.remove("hidden");
    document.getElementById("admin-email").textContent=session.user.email||"Administrador";
    const dot=document.getElementById("connection-state");
    if(dot)dot.textContent="CONECTADO";
}

async function loadProducts(){
    const tbody=document.getElementById("products-table");
    tbody.innerHTML='<tr><td colspan="6" class="loading">Cargando productos...</td></tr>';

    const pageSize=1000;
    const all=[];
    for(let page=0;page<50;page++){
        const from=page*pageSize;
        const to=from+pageSize-1;
        let r=await sb("/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,descuento_porcentaje,imagen,imagenes,categoria,stock,activo&order=id.asc",{
            headers:{Range:`${from}-${to}`,"Range-Unit":"items"}
        });
        let d=await r.json().catch(()=>[]);
        if(!r.ok){
            r=await sb("/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,imagen,imagenes,categoria,stock,activo&order=id.asc",{
                headers:{Range:`${from}-${to}`,"Range-Unit":"items"}
            });
            d=await r.json().catch(()=>[]);
        }
        if(!r.ok)throw new Error("No se pudieron cargar los productos.");
        if(!Array.isArray(d))break;
        all.push(...d);
        if(d.length<pageSize)break;
    }
    productos=all;

    document.getElementById("stat-products").textContent=productos.length;
    document.getElementById("stat-stock").textContent=productos.reduce((s,p)=>s+Math.max(0,Number(p.stock)||0),0);
    document.getElementById("stat-active").textContent=productos.filter(p=>p.activo).length;

    const stockAlert=document.getElementById("product-stock-alert");
    if(stockAlert){
        const critical=productos.filter(p=>p.activo&&Math.max(0,Number(p.stock)||0)<=3).length;
        stockAlert.hidden=critical===0;
        stockAlert.textContent=critical===1?"1 PRODUCTO REQUIERE STOCK":`${critical} PRODUCTOS REQUIEREN STOCK`;
    }

    renderProducts();
    renderCategoryManager();
}

function renderProducts(){
    const tbody=document.getElementById("products-table");
    const search=(document.getElementById("product-search")?.value||"").trim().toLowerCase();
    const filter=document.getElementById("product-filter")?.value||"all";
    const filtered=productos.filter(p=>{
        const haystack=`${p.nombre||""} ${p.categoria||""}`.toLowerCase();
        const matchesSearch=!search||haystack.includes(search);
        const stock=Math.max(0,Number(p.stock)||0);
        const matchesFilter=filter==="all" ||
            (filter==="active"&&p.activo) ||
            (filter==="hidden"&&!p.activo) ||
            (filter==="low"&&stock>0&&stock<=3) ||
            (filter==="out"&&stock===0);
        return matchesSearch&&matchesFilter;
    });

    const count=document.getElementById("product-list-count");
    if(count)count.textContent=`${filtered.length} de ${productos.length} productos`;
    tbody.innerHTML="";
    if(!filtered.length){
        tbody.innerHTML='<tr><td colspan="6" class="loading empty-state">No encontramos productos con esos filtros.</td></tr>';
        return;
    }

    const productRows=document.createDocumentFragment();

    filtered.forEach(p=>{
        const tr=document.createElement("tr");
        const stock=Math.max(0,Number(p.stock)||0);
        const stockClass=stock===0?"stock-out":stock<=3?"stock-low":"stock-ok";
        const stockText=stock===0?"SIN STOCK":stock<=3?`${stock} · BAJO`:`${stock}`;
        tr.innerHTML=`
            <td><div class="thumb-shell"><img class="product-thumb" src="${esc(resolveAdminImage(p.imagen))}" alt="" loading="lazy" decoding="async"></div></td>
            <td><strong class="product-name-cell">${esc(p.nombre)}</strong><div class="cell-sub">${esc(p.categoria||"Sin categoría")}</div></td>
            <td><strong class="price-cell">${esc(money.format((Number(p.precio)||0)*(1-Math.min(90,Math.max(0,Number(p.descuento_porcentaje)||0))/100)))}</strong>${Number(p.descuento_porcentaje)>0?`<div class="cell-sub"><s>${esc(money.format(Number(p.precio)||0))}</s> · -${Math.round(Number(p.descuento_porcentaje)||0)}%</div>`:""}</td>
            <td><span class="stock-pill ${stockClass}">${stockText}</span></td>
            <td><span class="badge ${p.activo?"on":"off"}">${p.activo?"ACTIVO":"OCULTO"}</span></td>
            <td><div class="row-actions"><button class="icon-btn edit" type="button">${icon("edit")}<span>EDITAR</span></button><button class="icon-btn remove" type="button">${icon("trash")}<span>ELIMINAR</span></button></div></td>
        `;
        tr.querySelector(".edit").onclick=()=>editProduct(p.id);
        tr.querySelector(".remove").onclick=()=>deleteProduct(p.id,p.nombre);
        productRows.appendChild(tr);
    });
    tbody.appendChild(productRows);
}


function normalizeCategoryName(value){
    return String(value||"").trim().replace(/\s+/g," ").slice(0,80);
}

function findCategoryByName(name){
    const key=normalizeCategoryName(name).toLocaleLowerCase("es");
    return categorias.find(item=>normalizeCategoryName(item.nombre).toLocaleLowerCase("es")===key)||null;
}

function categoryUsageCount(name){
    const key=normalizeCategoryName(name).toLocaleLowerCase("es");
    return productos.filter(product=>normalizeCategoryName(product.categoria).toLocaleLowerCase("es")===key).length;
}

function hideCategorySuggestions(){
    const box=document.getElementById("category-suggestions");
    const input=document.getElementById("product-category");
    if(box)box.hidden=true;
    if(input)input.setAttribute("aria-expanded","false");
}

function useCategory(name,options={}){
    const input=document.getElementById("product-category");
    const closeManager=options.closeManager!==false;
    if(!input)return;
    input.value=normalizeCategoryName(name);
    hideCategorySuggestions();
    if(closeManager){
        const manager=document.getElementById("category-manager");
        const toggle=document.getElementById("category-manage-toggle");
        if(manager)manager.hidden=true;
        if(toggle)toggle.setAttribute("aria-expanded","false");
    }
    input.focus({preventScroll:true});
}

function renderCategorySuggestions(){
    const input=document.getElementById("product-category");
    const box=document.getElementById("category-suggestions");
    if(!input||!box)return;

    const query=normalizeCategoryName(input.value).toLocaleLowerCase("es");
    const matches=categorias
        .filter(item=>!query||String(item.nombre||"").toLocaleLowerCase("es").includes(query))
        .slice(0,8);

    box.replaceChildren();

    if(!matches.length){
        const empty=document.createElement("div");
        empty.className="category-suggestion-empty";
        empty.textContent=query?"No existe todavía. Podés crearla.":"Todavía no hay categorías creadas.";
        box.appendChild(empty);
    }else{
        matches.forEach(item=>{
            const button=document.createElement("button");
            button.type="button";
            button.className="category-suggestion";
            button.setAttribute("role","option");

            const label=document.createElement("span");
            label.textContent=String(item.nombre||"");
            const small=document.createElement("small");
            const uses=categoryUsageCount(item.nombre);
            small.textContent=String(uses)+" "+(uses===1?"producto":"productos");
            button.append(label,small);

            button.addEventListener("click",()=>useCategory(item.nombre));
            box.appendChild(button);
        });
    }

    box.hidden=false;
    input.setAttribute("aria-expanded","true");
}

function syncCategoryDeleteButtons(){
    const validIds=new Set(categorias.map(item=>String(item.id)));
    selectedCategories=new Set([...selectedCategories].filter(id=>validIds.has(String(id))));
    const selectedButton=document.getElementById("category-delete-selected");
    const allButton=document.getElementById("category-delete-all");
    if(selectedButton)selectedButton.disabled=selectedCategories.size===0;
    if(allButton)allButton.disabled=categorias.length===0;
}

function renderCategoryManager(){
    const list=document.getElementById("category-list");
    const count=document.getElementById("category-count");
    if(count)count.textContent=String(categorias.length)+" "+(categorias.length===1?"categoría":"categorías");
    if(!list)return;

    list.replaceChildren();
    if(!categorias.length){
        const empty=document.createElement("div");
        empty.className="category-list-empty";
        empty.textContent="Todavía no creaste categorías.";
        list.appendChild(empty);
        syncCategoryDeleteButtons();
        return;
    }

    categorias.forEach(item=>{
        const row=document.createElement("div");
        row.className="category-manager-row";

        const checkbox=document.createElement("input");
        checkbox.type="checkbox";
        checkbox.className="category-checkbox";
        checkbox.setAttribute("aria-label","Seleccionar "+String(item.nombre||""));
        checkbox.checked=selectedCategories.has(String(item.id));
        checkbox.addEventListener("change",()=>{
            if(checkbox.checked)selectedCategories.add(String(item.id));
            else selectedCategories.delete(String(item.id));
            row.classList.toggle("is-selected",checkbox.checked);
            syncCategoryDeleteButtons();
        });

        const use=document.createElement("button");
        use.type="button";
        use.className="category-use";

        const strong=document.createElement("strong");
        strong.textContent=String(item.nombre||"");
        const small=document.createElement("small");
        const uses=categoryUsageCount(item.nombre);
        small.textContent=String(uses)+" "+(uses===1?"producto":"productos");
        use.append(strong,small);
        use.addEventListener("click",()=>useCategory(item.nombre));

        row.classList.toggle("is-selected",checkbox.checked);
        row.append(checkbox,use);
        list.appendChild(row);
    });

    syncCategoryDeleteButtons();
}

async function loadCategories(){
    try{
        const r=await sb("/rest/v1/categorias?select=id,nombre&order=nombre.asc");
        const d=await r.json().catch(()=>[]);
        if(!r.ok)throw new Error("No se pudieron cargar las categorías.");
        categorias=Array.isArray(d)?d:[];
        categorias.sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es",{sensitivity:"base"}));
    }catch(error){
        console.error("Categorías:",error);
        categorias=[];
    }
    renderCategoryManager();
}

async function persistCategory(rawName,options={}){
    const silent=options.silent===true;
    const name=normalizeCategoryName(rawName);
    if(!name)throw new Error("Escribí un nombre para la categoría.");

    const existing=findCategoryByName(name);
    if(existing){
        if(!silent)showToast("La categoría “"+existing.nombre+"” ya existe.");
        return existing;
    }

    const r=await sb("/rest/v1/categorias",{
        method:"POST",
        headers:{Prefer:"return=representation"},
        body:JSON.stringify({nombre:name})
    });
    const d=await r.json().catch(()=>[]);

    if(!r.ok){
        if(r.status===409){
            await loadCategories();
            const duplicate=findCategoryByName(name);
            if(duplicate)return duplicate;
        }
        throw new Error((d&&d.message)||"No se pudo crear la categoría.");
    }

    await loadCategories();
    const created=findCategoryByName(name);
    if(!silent)showToast("Categoría “"+((created&&created.nombre)||name)+"” creada.");
    return created||{nombre:name};
}

async function createCategoryFromInput(){
    const input=document.getElementById("product-category");
    const button=document.getElementById("category-create");
    if(!input||!button)return;
    button.disabled=true;
    try{
        const created=await persistCategory(input.value);
        input.value=created.nombre;
        hideCategorySuggestions();
    }catch(error){
        showToast(error.message||"No se pudo crear la categoría.","error");
    }finally{
        button.disabled=false;
    }
}

async function deleteCategories(items){
    const rows=Array.isArray(items)?items.filter(Boolean):[];
    if(!rows.length)return;

    const productCount=productos.filter(product=>rows.some(item=>
        normalizeCategoryName(item.nombre).toLocaleLowerCase("es")===
        normalizeCategoryName(product.categoria).toLocaleLowerCase("es")
    )).length;

    const countText=rows.length===1?"esta categoría":String(rows.length)+" categorías";
    const productText=productCount
        ? String(productCount)+" "+(productCount===1?"producto quedará":"productos quedarán")+" sin categoría."
        : "No hay productos asociados.";

    const ok=await confirmAction({
        title:rows.length===1?"Eliminar categoría":"Eliminar categorías",
        text:"Se eliminará "+countText+". "+productText+" Los productos no se borran.",
        confirmText:"ELIMINAR",
        danger:true
    });
    if(!ok)return;

    try{
        for(const item of rows){
            const patch=await sb("/rest/v1/productos?categoria=eq."+encodeURIComponent(item.nombre),{
                method:"PATCH",
                headers:{Prefer:"return=minimal"},
                body:JSON.stringify({categoria:""})
            });
            if(!patch.ok)throw new Error("No se pudo liberar la categoría de sus productos.");
        }

        const ids=rows.map(item=>Number(item.id)).filter(Number.isFinite);
        if(ids.length){
            const del=await sb("/rest/v1/categorias?id=in.("+ids.join(",")+")",{
                method:"DELETE",
                headers:{Prefer:"return=minimal"}
            });
            if(!del.ok)throw new Error("No se pudieron eliminar las categorías.");
        }

        const input=document.getElementById("product-category");
        if(input&&rows.some(item=>normalizeCategoryName(item.nombre).toLocaleLowerCase("es")===normalizeCategoryName(input.value).toLocaleLowerCase("es"))){
            input.value="";
        }

        selectedCategories.clear();
        await loadProducts();
        await loadCategories();
        showToast(rows.length===1?"Categoría eliminada.":"Categorías eliminadas.");
    }catch(error){
        showToast(error.message||"No se pudieron eliminar las categorías.","error");
    }
}

async function deleteAllCategories(){
    if(!categorias.length)return;
    const associated=productos.filter(product=>normalizeCategoryName(product.categoria)).length;
    const productText=associated
        ? String(associated)+" "+(associated===1?"producto quedará":"productos quedarán")+" sin categoría."
        : "No hay productos asociados.";

    const ok=await confirmAction({
        title:"Eliminar todas las categorías",
        text:"Se eliminarán las "+String(categorias.length)+" categorías guardadas. "+productText+" Ningún producto será eliminado.",
        confirmText:"ELIMINAR TODAS",
        danger:true
    });
    if(!ok)return;

    try{
        const patch=await sb("/rest/v1/productos?id=gt.0",{
            method:"PATCH",
            headers:{Prefer:"return=minimal"},
            body:JSON.stringify({categoria:""})
        });
        if(!patch.ok)throw new Error("No se pudieron liberar las categorías de los productos.");

        const del=await sb("/rest/v1/categorias?id=gt.0",{
            method:"DELETE",
            headers:{Prefer:"return=minimal"}
        });
        if(!del.ok)throw new Error("No se pudieron eliminar todas las categorías.");

        const input=document.getElementById("product-category");
        if(input)input.value="";
        selectedCategories.clear();
        await loadProducts();
        await loadCategories();
        showToast("Todas las categorías fueron eliminadas.");
    }catch(error){
        showToast(error.message||"No se pudieron eliminar las categorías.","error");
    }
}

function resetProductForm(){
    document.getElementById("product-form").reset();
    document.getElementById("product-id").value="";
    document.getElementById("product-active").value="true";
    document.getElementById("product-discount").value="0";
    document.getElementById("product-form-title").textContent="Nuevo producto";
    document.getElementById("product-save").textContent="GUARDAR PRODUCTO";
    document.getElementById("product-cancel").classList.add("hidden");
    resetProductGallery();
    msg("product-message","");
    requestAnimationFrame(()=>window.__doradoRefreshAdminSelects?.());
}

function editProduct(id){
    const p=productos.find(x=>String(x.id)===String(id));
    if(!p)return;
    document.getElementById("product-id").value=p.id;
    document.getElementById("product-name").value=p.nombre||"";
    document.getElementById("product-description").value=p.descripcion||"";
    document.getElementById("product-features").value=p.caracteristicas||"";
    document.getElementById("product-price").value=Number(p.precio)||0;
    document.getElementById("product-discount").value=Math.max(0,Number(p.descuento_porcentaje)||0);
    document.getElementById("product-stock").value=Number(p.stock)||0;
    document.getElementById("product-category").value=p.categoria||"";
    document.getElementById("product-image").value="";
    document.getElementById("product-active").value=String(Boolean(p.activo));
    document.getElementById("product-form-title").textContent="Editar producto";
    document.getElementById("product-save").textContent="GUARDAR CAMBIOS";
    document.getElementById("product-cancel").classList.remove("hidden");
    resetProductGallery(p);
    requestAnimationFrame(()=>window.__doradoRefreshAdminSelects?.());
    document.getElementById("product-form").scrollIntoView({behavior:"smooth",block:"start"});
}

async function uploadImage(file){
    if(!file)return "";

    const uploadFile=await optimizeImageForUpload(file);

    await refreshSessionIfNeeded();
    const cfg=await loadConfig();
    const cleanName=uploadFile.name.toLowerCase().replace(/[^a-z0-9._-]+/g,"-").slice(-100);
    const path=`${Date.now()}-${crypto.randomUUID()}-${cleanName}`;

    const r=await fetch(`${cfg.supabaseUrl}/storage/v1/object/productos/${encodeURIComponent(path)}`,{
        method:"POST",
        headers:{
            apikey:cfg.supabasePublishableKey,
            Authorization:`Bearer ${session.access_token}`,
            "Content-Type":uploadFile.type,
            "x-upsert":"false"
        },
        body:uploadFile
    });
    if(!r.ok){
        const d=await r.json().catch(()=>({}));
        throw new Error(d.message||"No se pudo subir la imagen.");
    }
    return `${cfg.supabaseUrl}/storage/v1/object/public/productos/${encodeURIComponent(path)}`;
}

async function saveProduct(event){
    event.preventDefault();
    const button=document.getElementById("product-save");
    button.disabled=true;
    msg("product-message","");

    try{
        const id=document.getElementById("product-id").value.trim();

        /* Si quedó una URL escrita sin tocar AGREGAR, también la sumamos. */
        if(String(document.getElementById("product-image").value||"").trim()){
            addUrlToGallery();
        }

        const uploadedUrls=[];
        for(const item of productGalleryDraft){
            if(item.type==="file"&&item.file){
                uploadedUrls.push(await uploadImage(item.file));
            }else if(item.url){
                uploadedUrls.push(String(item.url).trim());
            }
        }

        const imagenes=[...new Set(uploadedUrls.filter(Boolean))];
        if(!imagenes.length){
            imagenes.push("assets/images/brand/logo-dorado-640.webp");
        }

        const categoryName=normalizeCategoryName(document.getElementById("product-category").value);
        if(categoryName){
            const category=await persistCategory(categoryName,{silent:true});
            document.getElementById("product-category").value=category.nombre;
        }

        const payload={
            nombre:document.getElementById("product-name").value.trim(),
            descripcion:document.getElementById("product-description").value.trim(),
            caracteristicas:document.getElementById("product-features").value.trim(),
            precio:Number(document.getElementById("product-price").value),
            descuento_porcentaje:Math.min(90,Math.max(0,Number(document.getElementById("product-discount").value)||0)),
            stock:Math.max(0,Math.floor(Number(document.getElementById("product-stock").value)||0)),
            categoria:normalizeCategoryName(document.getElementById("product-category").value),
            imagen:imagenes[0],
            imagenes,
            activo:document.getElementById("product-active").value==="true"
        };

        if(!payload.nombre||!Number.isFinite(payload.precio)||payload.precio<0){
            throw new Error("Revisá nombre y precio.");
        }

        const path=id?`/rest/v1/productos?id=eq.${encodeURIComponent(id)}`:"/rest/v1/productos";
        const r=await sb(path,{
            method:id?"PATCH":"POST",
            headers:{Prefer:"return=minimal"},
            body:JSON.stringify(payload)
        });

        if(!r.ok){
            const d=await r.json().catch(()=>({}));
            throw new Error(d.message||"No se pudo guardar el producto.");
        }

        msg("product-message",id?"Cambios guardados.":"Producto creado.","ok");
        showToast(id?"Cambios guardados correctamente.":"Producto creado correctamente.");
        await loadProducts();
        setTimeout(resetProductForm,700);
    }catch(e){
        msg("product-message",e.message||"Ocurrió un error.","error");
    }finally{
        button.disabled=false;
    }
}

async function deleteProduct(id,name){
    const ok=await confirmAction({
        title:"Eliminar producto",
        text:`Vas a eliminar “${name}”. Esta acción no se puede deshacer.`,
        confirmText:"ELIMINAR",
        danger:true
    });
    if(!ok)return;
    try{
        const r=await sb(`/rest/v1/productos?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});
        if(!r.ok)throw new Error("No se pudo eliminar. Si el producto tiene pedidos asociados, ocultalo en lugar de borrarlo.");
        await loadProducts();
        resetProductForm();
        showToast("Producto eliminado.");
    }catch(e){
        showToast(e.message||"No se pudo eliminar.","error");
    }
}


function updateOrderSelectionUI(){
    const checkboxes=Array.from(document.querySelectorAll(".order-checkbox"));
    const selectedVisible=checkboxes.filter(cb=>selectedOrders.has(cb.dataset.orderId)).length;
    const allVisible=checkboxes.length>0&&selectedVisible===checkboxes.length;

    const master=document.getElementById("orders-select-all");
    const masterHead=document.getElementById("orders-select-all-head");
    const count=document.getElementById("orders-selected-count");
    const deleteButton=document.getElementById("delete-selected-orders");

    if(master){master.checked=allVisible;master.indeterminate=selectedVisible>0&&!allVisible;}
    if(masterHead){masterHead.checked=allVisible;masterHead.indeterminate=selectedVisible>0&&!allVisible;}
    if(count)count.textContent=`${selectedOrders.size} ${selectedOrders.size===1?"seleccionado":"seleccionados"}`;
    if(deleteButton)deleteButton.disabled=selectedOrders.size===0;

    checkboxes.forEach(cb=>{
        const selected=selectedOrders.has(cb.dataset.orderId);
        cb.checked=selected;
        cb.closest("tr")?.classList.toggle("is-selected",selected);
    });
}

function setAllVisibleOrdersSelected(checked){
    document.querySelectorAll(".order-checkbox").forEach(cb=>{
        const id=String(cb.dataset.orderId||"");
        if(!id)return;
        if(checked)selectedOrders.add(id);
        else selectedOrders.delete(id);
    });
    updateOrderSelectionUI();
}

async function deleteSelectedOrders(){
    const ids=Array.from(selectedOrders);
    if(!ids.length)return;

    const ok=await confirmAction({
        title:ids.length===1?"Eliminar pedido":"Eliminar pedidos",
        text:ids.length===1
            ?"Vas a eliminar definitivamente este pedido y sus productos asociados. Esta acción no se puede deshacer."
            :`Vas a eliminar definitivamente ${ids.length} pedidos y sus productos asociados. Esta acción no se puede deshacer.`,
        confirmText:ids.length===1?"ELIMINAR PEDIDO":"ELIMINAR PEDIDOS",
        danger:true
    });
    if(!ok)return;

    const button=document.getElementById("delete-selected-orders");
    const original=button?.innerHTML||"";
    if(button){button.disabled=true;button.textContent="ELIMINANDO...";}

    try{
        await refreshSessionIfNeeded();
        const r=await fetch("/api/admin-delete-orders",{
            method:"POST",
            headers:{
                Authorization:`Bearer ${session.access_token}`,
                "Content-Type":"application/json",
                Accept:"application/json"
            },
            body:JSON.stringify({ids})
        });
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.error||"No se pudieron eliminar los pedidos.");

        selectedOrders.clear();
        await loadOrders();
        showToast(`${Number(d.deleted)||ids.length} ${ids.length===1?"pedido eliminado":"pedidos eliminados"}.`);
    }catch(e){
        showToast(e.message||"No se pudieron eliminar los pedidos.","error");
        updateOrderSelectionUI();
    }finally{
        if(button){
            button.innerHTML=original;
            updateOrderSelectionUI();
        }
    }
}

function orderBadgeClass(status){
    if(status==="pagado")return "pagado";
    if(["pendiente","pago_pendiente"].includes(status))return "pendiente";
    if(["pago_rechazado","pago_cancelado"].includes(status))return status;
    if(status.includes("revisar"))return "review";
    return "";
}

function filteredOrders(){
    const search=String(document.getElementById("order-search")?.value||"").trim().toLowerCase();
    const payment=String(document.getElementById("order-payment-filter")?.value||"all");
    const prep=String(document.getElementById("order-prep-filter")?.value||"all");
    const dateFrom=String(document.getElementById("order-date-from")?.value||"");
    const dateTo=String(document.getElementById("order-date-to")?.value||"");
    const fromTs=dateFrom?new Date(`${dateFrom}T00:00:00`).getTime():null;
    const toTs=dateTo?new Date(`${dateTo}T23:59:59.999`).getTime():null;

    return pedidos.filter(order=>{
        const haystack=[
            orderCode(order.id),
            order.id,
            order.cliente_nombre,
            order.cliente_email,
            order.cliente_telefono,
            order.ciudad,
            order.provincia
        ].map(v=>String(v||"").toLowerCase()).join(" ");

        const createdTs=new Date(order.created_at).getTime();
        const matchesSearch=!search||haystack.includes(search);
        const matchesPayment=payment==="all"||orderPaymentGroup(order.estado)===payment;
        const matchesPrep=prep==="all"||String(order.preparacion_estado||"nuevo")===prep;
        const matchesFrom=fromTs===null||(!Number.isNaN(createdTs)&&createdTs>=fromTs);
        const matchesTo=toTs===null||(!Number.isNaN(createdTs)&&createdTs<=toTs);
        return matchesSearch&&matchesPayment&&matchesPrep&&matchesFrom&&matchesTo;
    });
}

function csvCell(value){
    let text=String(value??"").replaceAll('"','""');
    // Evita que Excel interprete contenido de clientes como una fórmula.
    if(/^[=+\-@]/.test(text))text=`'${text}`;
    return `"${text}"`;
}

function exportFilteredOrders(){
    const rows=filteredOrders();
    if(!rows.length){
        showToast("No hay pedidos para exportar con estos filtros.","error");
        return;
    }

    const header=["Pedido","Fecha","Cliente","Email","Teléfono","Total ARS","Pago","Preparación","Transportista","Tracking","Estado envío","Ciudad","Provincia"];
    const lines=[header.map(csvCell).join(",")];

    rows.forEach(order=>{
        lines.push([
            orderCode(order.id),
            new Date(order.created_at).toLocaleString("es-AR"),
            order.cliente_nombre,
            order.cliente_email,
            order.cliente_telefono,
            Number(order.total)||0,
            orderStatusLabel(order.estado),
            String(order.preparacion_estado||"nuevo").toUpperCase(),
            order.envio_transportista||"",
            order.envio_tracking_codigo||"",
            shippingStatusLabel(order.envio_estado),
            order.ciudad,
            order.provincia
        ].map(csvCell).join(","));
    });

    const blob=new Blob(["\ufeff"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`dorado-art-pesca-pedidos-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`${rows.length} ${rows.length===1?"pedido exportado":"pedidos exportados"}.`);
}

function renderOrders(){
    const tbody=document.getElementById("orders-table");
    if(!tbody)return;

    const visible=filteredOrders();
    const visibleIds=new Set(visible.map(o=>String(o.id)));

    // Nunca dejamos pedidos seleccionados pero ocultos por un filtro.
    for(const id of [...selectedOrders]){
        if(!visibleIds.has(id))selectedOrders.delete(id);
    }

    const count=document.getElementById("orders-list-count");
    if(count)count.textContent=`${visible.length} de ${pedidos.length} pedidos`;

    tbody.innerHTML="";
    if(!visible.length){
        tbody.innerHTML='<tr><td colspan="8" class="loading">No encontramos pedidos con esos filtros.</td></tr>';
        updateOrderSelectionUI();
        return;
    }

    const orderRows=document.createDocumentFragment();

    visible.forEach(o=>{
        const tr=document.createElement("tr");
        const date=new Date(o.created_at);
        const code=orderCode(o.id);
        tr.innerHTML=`
            <td class="order-check-cell"><input class="order-checkbox" type="checkbox" data-order-id="${esc(o.id)}" aria-label="Seleccionar pedido ${esc(code)}"></td>
            <td>${esc(date.toLocaleString("es-AR"))}</td>
            <td><strong>${esc(o.cliente_nombre)}</strong><div class="cell-sub">${esc(code)}</div></td>
            <td>${esc(o.cliente_email)}<div class="cell-sub">${esc(o.cliente_telefono)}</div></td>
            <td><strong>${esc(money.format(Number(o.total)||0))}</strong></td>
            <td><span class="badge ${orderBadgeClass(String(o.estado||""))}">${esc(orderStatusLabel(o.estado))}</span></td>
            <td>
                <select class="fulfillment-select" aria-label="Estado de preparación de ${esc(code)}">
                    <option value="nuevo" ${o.preparacion_estado==="nuevo"?"selected":""}>NUEVO</option>
                    <option value="preparando" ${o.preparacion_estado==="preparando"?"selected":""}>PREPARANDO</option>
                    <option value="enviado" ${o.preparacion_estado==="enviado"?"selected":""}>ENVIADO</option>
                    <option value="entregado" ${o.preparacion_estado==="entregado"?"selected":""}>ENTREGADO</option>
                    <option value="cancelado" ${o.preparacion_estado==="cancelado"?"selected":""}>CANCELADO</option>
                </select>
            </td>
            <td><button class="icon-btn order-view" type="button">${icon("eye")}<span>VER PEDIDO</span></button></td>
        `;
        tr.querySelector(".fulfillment-select")?.setAttribute("data-order-id",String(o.id));
        tr.querySelector(".order-view")?.setAttribute("data-order-id",String(o.id));
        orderRows.appendChild(tr);
    });
    tbody.appendChild(orderRows);

    updateOrderSelectionUI();
}

async function loadOrders(){
    const tbody=document.getElementById("orders-table");
    selectedOrders.clear();
    tbody.innerHTML='<tr><td colspan="8" class="loading">Cargando pedidos...</td></tr>';
    updateOrderSelectionUI();

    let r=await sb("/rest/v1/pedidos?select=id,created_at,cliente_nombre,cliente_email,cliente_telefono,domicilio,ciudad,provincia,codigo_postal,metodo_entrega,notas,subtotal,descuento_total,cupon_codigo,total,estado,preparacion_estado,tracking_token,envio_transportista,envio_tracking_codigo,envio_tracking_url,envio_estado,envio_despachado_at,envio_actualizado_at&order=created_at.desc&limit=300");
    let d=await r.json().catch(()=>[]);
    if(!r.ok){
        r=await sb("/rest/v1/pedidos?select=id,created_at,cliente_nombre,cliente_email,cliente_telefono,domicilio,ciudad,provincia,codigo_postal,metodo_entrega,notas,total,estado,preparacion_estado,tracking_token,envio_transportista,envio_tracking_codigo,envio_tracking_url,envio_estado,envio_despachado_at,envio_actualizado_at&order=created_at.desc&limit=300");
        d=await r.json().catch(()=>[]);
    }
    if(!r.ok)throw new Error("No se pudieron cargar los pedidos.");

    pedidos=Array.isArray(d)?d:[];

    const totalEl=document.getElementById("order-stat-total");
    const paidEl=document.getElementById("order-stat-paid");
    const pendingEl=document.getElementById("order-stat-pending");
    const revenueEl=document.getElementById("order-stat-revenue");
    const ticketEl=document.getElementById("order-stat-ticket");
    const toShipEl=document.getElementById("order-stat-to-ship");
    const paidOrders=pedidos.filter(o=>orderPaymentGroup(o.estado)==="pagado");
    const paidRevenue=paidOrders.reduce((sum,o)=>sum+Math.max(0,Number(o.total)||0),0);
    const toShip=paidOrders.filter(o=>["nuevo","preparando"].includes(String(o.preparacion_estado||"nuevo"))).length;
    if(totalEl)totalEl.textContent=pedidos.length;
    if(paidEl)paidEl.textContent=paidOrders.length;
    if(pendingEl)pendingEl.textContent=pedidos.filter(o=>orderPaymentGroup(o.estado)==="pendiente").length;
    if(revenueEl)revenueEl.textContent=money.format(paidRevenue);
    if(ticketEl)ticketEl.textContent=money.format(paidOrders.length?paidRevenue/paidOrders.length:0);
    if(toShipEl)toShipEl.textContent=toShip;

    renderOrders();
}


async function updateFulfillment(id,value){
    const allowed=["nuevo","preparando","enviado","entregado","cancelado"];
    if(!allowed.includes(value))return;
    try{
        const r=await sb(`/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}`,{
            method:"PATCH",
            headers:{Prefer:"return=minimal"},
            body:JSON.stringify({preparacion_estado:value})
        });
        if(!r.ok)throw new Error("No se pudo actualizar el estado de preparación.");
        const local=pedidos.find(o=>String(o.id)===String(id));
        if(local)local.preparacion_estado=value;
        renderOrders();
        showToast("Estado del pedido actualizado.");
    }catch(e){
        showToast(e.message||"No se pudo actualizar el pedido.","error");
        await loadOrders();
    }
}

async function openOrder(order){
    const modal=document.getElementById("order-modal");
    const content=document.getElementById("order-modal-content");
    modal.classList.add("active");
    modal.setAttribute("aria-hidden","false");
    content.className="loading";
    content.textContent="Cargando detalle...";

    try{
        const r=await sb(`/rest/v1/pedido_items?pedido_id=eq.${encodeURIComponent(order.id)}&select=nombre,cantidad,precio_unitario&order=id.asc`);
        const items=await r.json().catch(()=>[]);
        if(!r.ok)throw new Error("No se pudo cargar el detalle.");

        const code=orderCode(order.id);
        const link=trackingLink(order);
        const phone=String(order.cliente_telefono||"").replace(/\D/g,"");
        const waPhone=phone.startsWith("54")?phone:`54${phone}`;
        const waHref=phone
            ? `https://wa.me/${encodeURIComponent(waPhone)}?text=${encodeURIComponent(`Hola, te contactamos de DORADO ARTÍCULOS DE PESCA por tu pedido ${code}.`)}`
            : "";

        content.className="";
        content.innerHTML=`
            <div class="order-modal-code">
                <span>NÚMERO DE PEDIDO</span>
                <strong>${esc(code)}</strong>
                <small>${esc(new Date(order.created_at).toLocaleString("es-AR"))}</small>
            </div>
            <div class="order-meta">
                <div><span>CLIENTE</span><strong>${esc(order.cliente_nombre)}</strong></div>
                <div><span>CONTACTO</span><strong>${esc(order.cliente_email)} · ${esc(order.cliente_telefono)}</strong></div>
                <div><span>ENTREGA</span><strong>${esc(order.domicilio)}, ${esc(order.ciudad)}, ${esc(order.provincia)} · CP ${esc(order.codigo_postal)}</strong></div>
                <div><span>TOTAL</span><strong>${esc(money.format(Number(order.total)||0))}</strong>${Number(order.descuento_total)>0?`<small>Subtotal ${esc(money.format(Number(order.subtotal)||0))} · Descuento -${esc(money.format(Number(order.descuento_total)||0))}${order.cupon_codigo?` · Cupón ${esc(order.cupon_codigo)}`:""}</small>`:""}</div>
                <div><span>PAGO</span><strong>${esc(orderStatusLabel(order.estado))}</strong></div>
                <div><span>PREPARACIÓN</span><strong>${esc(String(order.preparacion_estado||"nuevo").toUpperCase())}</strong></div>
            </div>
            <section class="order-shipping-card" aria-label="Seguimiento del envío">
                <div class="order-shipping-head">
                    <div><span class="section-tag">LOGÍSTICA</span><h3>Seguimiento del envío</h3></div>
                    <span class="shipping-state-chip">${esc(shippingStatusLabel(order.envio_estado))}</span>
                </div>
                <div class="shipping-form-grid">
                    <label><span>TRANSPORTISTA</span><input class="shipping-carrier" maxlength="80" value="${esc(order.envio_transportista||"")}" placeholder="Ej: Andreani"></label>
                    <label><span>CÓDIGO DE SEGUIMIENTO</span><input class="shipping-code" maxlength="160" value="${esc(order.envio_tracking_codigo||"")}" placeholder="Código del transporte"></label>
                    <label><span>ESTADO DEL ENVÍO</span><select class="shipping-status">
                        <option value="pendiente" ${String(order.envio_estado||"pendiente")==="pendiente"?"selected":""}>Pendiente</option>
                        <option value="despachado" ${order.envio_estado==="despachado"?"selected":""}>Despachado</option>
                        <option value="en_transito" ${order.envio_estado==="en_transito"?"selected":""}>En tránsito</option>
                        <option value="en_distribucion" ${order.envio_estado==="en_distribucion"?"selected":""}>En distribución</option>
                        <option value="entregado" ${order.envio_estado==="entregado"?"selected":""}>Entregado</option>
                        <option value="incidencia" ${order.envio_estado==="incidencia"?"selected":""}>Incidencia</option>
                    </select></label>
                    <label><span>URL OFICIAL DE TRACKING</span><input class="shipping-url" type="url" maxlength="1000" value="${esc(safeHttpsUrl(order.envio_tracking_url))}" placeholder="https://..."></label>
                </div>
                <p class="shipping-help">El cliente verá estos datos en su seguimiento privado. No se exponen domicilio, teléfono ni email.</p>
                <div class="order-shipping-actions">
                    <button class="primary save-shipping" type="button">GUARDAR SEGUIMIENTO</button>
                    ${safeHttpsUrl(order.envio_tracking_url)?`<a class="secondary shipping-official-link" href="${esc(safeHttpsUrl(order.envio_tracking_url))}" target="_blank" rel="noopener">ABRIR TRACKING OFICIAL</a>`:""}
                </div>
            </section>
            ${order.notas?`<div class="order-note"><strong>Aclaraciones:</strong> ${esc(order.notas)}</div>`:""}
            <div class="order-modal-actions">
                ${link?`<button class="secondary copy-tracking-link" type="button">COPIAR LINK DE SEGUIMIENTO</button>`:""}
                ${waHref?`<a class="primary" href="${esc(waHref)}" target="_blank" rel="noopener">ESCRIBIR AL CLIENTE</a>`:""}
            </div>
            <h3 class="order-products-title">Productos</h3>
            <div class="order-items">
                ${(Array.isArray(items)?items:[]).map(i=>`
                    <div class="order-item-row">
                        <div>
                            <strong>${esc(i.nombre)}</strong>
                            <small>${Math.max(1,Number(i.cantidad)||1)} × ${esc(money.format(Number(i.precio_unitario)||0))}</small>
                        </div>
                        <strong>${esc(money.format((Number(i.precio_unitario)||0)*(Number(i.cantidad)||0)))}</strong>
                    </div>
                `).join("") || '<div class="loading">Sin ítems.</div>'}
            </div>
        `;

        content.querySelector(".save-shipping")?.addEventListener("click",async e=>{
            const button=e.currentTarget;
            const original=button.textContent;
            const carrier=String(content.querySelector(".shipping-carrier")?.value||"").trim();
            const codeValue=String(content.querySelector(".shipping-code")?.value||"").trim();
            const statusValue=String(content.querySelector(".shipping-status")?.value||"pendiente").trim();
            const rawUrl=String(content.querySelector(".shipping-url")?.value||"").trim();
            const trackingUrl=rawUrl?safeHttpsUrl(rawUrl):"";
            const allowed=["pendiente","despachado","en_transito","en_distribucion","entregado","incidencia"];
            if(rawUrl&&!trackingUrl){showToast("La URL de seguimiento debe comenzar con https://","error");return;}
            if(!allowed.includes(statusValue)){showToast("Estado de envío inválido.","error");return;}

            button.disabled=true;
            button.textContent="GUARDANDO...";
            try{
                const now=new Date().toISOString();
                const nextPrep=statusValue==="entregado"?"entregado":(["despachado","en_transito","en_distribucion","incidencia"].includes(statusValue)?"enviado":String(order.preparacion_estado||"nuevo"));
                const payload={envio_transportista:carrier||null,envio_tracking_codigo:codeValue||null,envio_tracking_url:trackingUrl||null,envio_estado:statusValue,envio_actualizado_at:now,preparacion_estado:nextPrep};
                if(statusValue!=="pendiente"&&!order.envio_despachado_at)payload.envio_despachado_at=now;
                const response=await sb(`/rest/v1/pedidos?id=eq.${encodeURIComponent(order.id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
                if(!response.ok)throw new Error("No se pudo guardar el seguimiento del envío.");
                Object.assign(order,payload);
                content.querySelector(".shipping-state-chip").textContent=shippingStatusLabel(statusValue);
                let official=content.querySelector(".shipping-official-link");
                if(trackingUrl){
                    if(!official){official=document.createElement("a");official.className="secondary shipping-official-link";official.target="_blank";official.rel="noopener";official.textContent="ABRIR TRACKING OFICIAL";content.querySelector(".order-shipping-actions")?.appendChild(official);}
                    official.href=trackingUrl;
                }else official?.remove();
                renderOrders();
                showToast("Seguimiento del envío actualizado.");
            }catch(error){showToast(error?.message||"No se pudo guardar el seguimiento.","error");}
            finally{button.disabled=false;button.textContent=original;}
        });

        content.querySelector(".copy-tracking-link")?.addEventListener("click",async e=>{
            const button=e.currentTarget;
            const original=button.textContent;
            try{
                await navigator.clipboard.writeText(link);
                button.textContent="LINK COPIADO";
            }catch{
                button.textContent="NO SE PUDO COPIAR";
            }
            setTimeout(()=>button.textContent=original,1800);
        });
    }catch(e){
        content.className="message show error";
        content.textContent=e.message;
    }
}

function closeOrder(){
    const modal=document.getElementById("order-modal");
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden","true");
}


function localDateTimeValue(value){
    if(!value)return "";
    const d=new Date(value);
    if(!Number.isFinite(d.getTime()))return "";
    const local=new Date(d.getTime()-d.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
}

function couponValidityText(c){
    const from=c.vigente_desde?new Date(c.vigente_desde):null;
    const to=c.vigente_hasta?new Date(c.vigente_hasta):null;
    const fmt=d=>Number.isFinite(d?.getTime())?d.toLocaleDateString("es-AR"):"";
    if(from&&to)return `${fmt(from)} → ${fmt(to)}`;
    if(from)return `Desde ${fmt(from)}`;
    if(to)return `Hasta ${fmt(to)}`;
    return "Sin vencimiento";
}

function couponDiscountText(c){
    const value=Math.max(0,Number(c.valor)||0);
    return String(c.tipo||"")==="porcentaje" ? `${value}%` : money.format(value);
}

async function loadCoupons(){
    const tbody=document.getElementById("coupons-table");
    if(tbody)tbody.innerHTML='<tr><td colspan="6" class="loading">Cargando cupones...</td></tr>';
    const r=await sb("/rest/v1/cupones?select=id,codigo,tipo,valor,minimo_compra,activo,vigente_desde,vigente_hasta,limite_usos,usos,created_at&order=created_at.desc");
    const d=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error("No se pudieron cargar los cupones. Ejecutá la migración commerce-features.sql en Supabase.");
    cupones=Array.isArray(d)?d:[];
    document.getElementById("coupon-stat-total").textContent=cupones.length;
    document.getElementById("coupon-stat-active").textContent=cupones.filter(c=>c.activo).length;
    document.getElementById("coupon-stat-uses").textContent=cupones.reduce((sum,c)=>sum+Math.max(0,Number(c.usos)||0),0);
    renderCoupons();
}

function renderCoupons(){
    const tbody=document.getElementById("coupons-table");
    if(!tbody)return;
    const count=document.getElementById("coupon-list-count");
    if(count)count.textContent=`${cupones.length} ${cupones.length===1?"cupón":"cupones"}`;
    tbody.innerHTML="";
    if(!cupones.length){
        tbody.innerHTML='<tr><td colspan="6" class="loading">Todavía no hay cupones creados.</td></tr>';
        return;
    }
    cupones.forEach(c=>{
        const tr=document.createElement("tr");
        const uses=Math.max(0,Number(c.usos)||0);
        const limit=c.limite_usos==null?"∞":Math.max(0,Number(c.limite_usos)||0);
        tr.innerHTML=`
            <td><strong class="coupon-code-cell">${esc(c.codigo)}</strong><div class="cell-sub">Mínimo: ${esc(money.format(Number(c.minimo_compra)||0))}</div></td>
            <td><strong>${esc(couponDiscountText(c))}</strong><div class="cell-sub">${c.tipo==="porcentaje"?"Porcentaje":"Monto fijo"}</div></td>
            <td>${esc(couponValidityText(c))}</td>
            <td>${uses} / ${limit}</td>
            <td><span class="badge ${c.activo?"on":"off"}">${c.activo?"ACTIVO":"INACTIVO"}</span></td>
            <td><div class="row-actions"><button class="icon-btn coupon-edit" type="button">${icon("edit")}<span>EDITAR</span></button><button class="icon-btn coupon-remove" type="button">${icon("trash")}<span>ELIMINAR</span></button></div></td>`;
        tr.querySelector(".coupon-edit")?.addEventListener("click",()=>editCoupon(c.id));
        tr.querySelector(".coupon-remove")?.addEventListener("click",()=>deleteCoupon(c.id,c.codigo));
        tbody.appendChild(tr);
    });
}

function resetCouponForm(){
    const form=document.getElementById("coupon-form");
    if(!form)return;
    form.reset();
    document.getElementById("coupon-id").value="";
    document.getElementById("coupon-type").value="porcentaje";
    document.getElementById("coupon-minimum").value="0";
    document.getElementById("coupon-active").value="true";
    document.getElementById("coupon-form-title").textContent="Nuevo cupón";
    document.getElementById("coupon-save").textContent="GUARDAR CUPÓN";
    document.getElementById("coupon-cancel").classList.add("hidden");
    msg("coupon-message","");
    requestAnimationFrame(()=>window.__doradoRefreshAdminSelects?.());
}

function editCoupon(id){
    const c=cupones.find(x=>String(x.id)===String(id));
    if(!c)return;
    document.getElementById("coupon-id").value=c.id;
    document.getElementById("coupon-code").value=c.codigo||"";
    document.getElementById("coupon-type").value=c.tipo||"porcentaje";
    document.getElementById("coupon-value").value=Number(c.valor)||0;
    document.getElementById("coupon-minimum").value=Number(c.minimo_compra)||0;
    document.getElementById("coupon-limit").value=c.limite_usos==null?"":Number(c.limite_usos)||1;
    document.getElementById("coupon-from").value=localDateTimeValue(c.vigente_desde);
    document.getElementById("coupon-to").value=localDateTimeValue(c.vigente_hasta);
    document.getElementById("coupon-active").value=String(Boolean(c.activo));
    document.getElementById("coupon-form-title").textContent="Editar cupón";
    document.getElementById("coupon-save").textContent="GUARDAR CAMBIOS";
    document.getElementById("coupon-cancel").classList.remove("hidden");
    requestAnimationFrame(()=>window.__doradoRefreshAdminSelects?.());
    document.getElementById("coupon-form").scrollIntoView({behavior:"smooth",block:"start"});
}

async function saveCoupon(event){
    event.preventDefault();
    const button=document.getElementById("coupon-save");
    button.disabled=true;
    msg("coupon-message","");
    try{
        const id=document.getElementById("coupon-id").value.trim();
        const codigo=String(document.getElementById("coupon-code").value||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"").slice(0,40);
        const tipo=document.getElementById("coupon-type").value;
        const valor=Number(document.getElementById("coupon-value").value);
        const minimo=Math.max(0,Number(document.getElementById("coupon-minimum").value)||0);
        const limitRaw=document.getElementById("coupon-limit").value.trim();
        const fromRaw=document.getElementById("coupon-from").value;
        const toRaw=document.getElementById("coupon-to").value;
        if(!codigo||!Number.isFinite(valor)||valor<=0)throw new Error("Revisá el código y el valor del cupón.");
        if(tipo==="porcentaje"&&valor>100)throw new Error("Un cupón porcentual no puede superar el 100%.");
        const from=fromRaw?new Date(fromRaw).toISOString():null;
        const to=toRaw?new Date(toRaw).toISOString():null;
        if(from&&to&&new Date(to)<=new Date(from))throw new Error("La fecha de finalización debe ser posterior al inicio.");
        const payload={
            codigo,tipo,valor,minimo_compra:minimo,
            limite_usos:limitRaw?Math.max(1,Math.floor(Number(limitRaw)||1)):null,
            vigente_desde:from,vigente_hasta:to,
            activo:document.getElementById("coupon-active").value==="true",
            updated_at:new Date().toISOString()
        };
        const path=id?`/rest/v1/cupones?id=eq.${encodeURIComponent(id)}`:"/rest/v1/cupones";
        const r=await sb(path,{method:id?"PATCH":"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify(payload)});
        if(!r.ok){
            const d=await r.json().catch(()=>({}));
            throw new Error(d?.code==="23505"?"Ya existe un cupón con ese código.":(d?.message||"No se pudo guardar el cupón."));
        }
        showToast(id?"Cupón actualizado.":"Cupón creado.");
        await loadCoupons();
        resetCouponForm();
    }catch(error){
        msg("coupon-message",error?.message||"No se pudo guardar el cupón.","error");
    }finally{button.disabled=false;}
}

async function deleteCoupon(id,code){
    const ok=await confirmAction({title:"Eliminar cupón",text:`Vas a eliminar el cupón “${code}”.`,confirmText:"ELIMINAR",danger:true});
    if(!ok)return;
    try{
        const r=await sb(`/rest/v1/cupones?id=eq.${encodeURIComponent(id)}`,{method:"DELETE"});
        if(!r.ok)throw new Error("No se pudo eliminar el cupón.");
        await loadCoupons();
        resetCouponForm();
        showToast("Cupón eliminado.");
    }catch(error){showToast(error?.message||"No se pudo eliminar.","error");}
}

async function refreshAll(){
    const current=document.querySelector(".tab.active")?.dataset.tab;
    try{
        if(current==="orders")await loadOrders();
        else if(current==="coupons")await loadCoupons();
        else await loadProducts();
    }catch(e){
        showToast(e.message||"No se pudo actualizar.","error");
    }
}

document.getElementById("login-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const button=document.getElementById("login-button");
    button.disabled=true;
    msg("login-message","");
    try{
        await login(
            document.getElementById("login-email").value.trim(),
            document.getElementById("login-password").value
        );
        showApp();
        await loadProducts();
        await loadCategories();
    }catch(err){
        msg("login-message",err.message||"No se pudo iniciar sesión.");
    }finally{
        button.disabled=false;
    }
});

document.getElementById("forgot-password-button")?.addEventListener("click",()=>{
    const loginEmail=document.getElementById("login-email")?.value.trim()||"";
    const recoveryEmail=document.getElementById("recovery-email");
    if(recoveryEmail)recoveryEmail.value=loginEmail;
    msg("recovery-request-message","");
    setAuthView("request");
    setTimeout(()=>recoveryEmail?.focus(),0);
});

document.getElementById("recovery-back-button")?.addEventListener("click",()=>{
    msg("recovery-request-message","");
    setAuthView("login");
});

document.getElementById("recovery-request-form")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const button=document.getElementById("recovery-send-button");
    const email=document.getElementById("recovery-email")?.value.trim()||"";

    button.disabled=true;
    msg("recovery-request-message","");

    try{
        await requestPasswordRecovery(email);
        msg(
            "recovery-request-message",
            "Si el email corresponde a una cuenta autorizada, vas a recibir un enlace para restablecer la contraseña. Revisá también Spam o Correo no deseado.",
            "ok"
        );
    }catch(error){
        msg("recovery-request-message",error?.message||"No se pudo enviar el enlace.");
    }finally{
        button.disabled=false;
    }
});

document.getElementById("recovery-update-form")?.addEventListener("submit",async e=>{
    e.preventDefault();
    const button=document.getElementById("recovery-update-button");
    const password=document.getElementById("recovery-new-password")?.value||"";
    const confirm=document.getElementById("recovery-confirm-password")?.value||"";

    msg("recovery-update-message","");

    if(password.length<8){
        msg("recovery-update-message","La contraseña debe tener al menos 8 caracteres.");
        return;
    }

    if(password!==confirm){
        msg("recovery-update-message","Las contraseñas no coinciden.");
        return;
    }

    button.disabled=true;
    try{
        await updateRecoveredPassword(password);
        document.getElementById("recovery-new-password").value="";
        document.getElementById("recovery-confirm-password").value="";
        setAuthView("login");
        msg("login-message","Contraseña actualizada correctamente. Ya podés ingresar al panel.","ok");
        document.getElementById("login-password")?.focus();
    }catch(error){
        msg("recovery-update-message",error?.message||"No se pudo actualizar la contraseña.");
    }finally{
        button.disabled=false;
    }
});

document.getElementById("product-form").addEventListener("submit",saveProduct);
document.getElementById("coupon-form")?.addEventListener("submit",saveCoupon);
document.getElementById("coupon-cancel")?.addEventListener("click",resetCouponForm);
document.getElementById("coupon-code")?.addEventListener("input",e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,"");});
document.getElementById("product-cancel").addEventListener("click",resetProductForm);
document.getElementById("logout-button").addEventListener("click",()=>logout());
document.getElementById("refresh-button").addEventListener("click",refreshAll);

document.querySelectorAll(".tab").forEach(button=>{
    button.addEventListener("click",async()=>{
        document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===button));
        document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
        document.getElementById(`${button.dataset.tab}-panel`).classList.add("active");
        if(button.dataset.tab==="orders"){
            try{await loadOrders();}catch(e){showToast(e.message||"No se pudieron cargar los pedidos.","error");}
        }else if(button.dataset.tab==="coupons"){
            try{await loadCoupons();}catch(e){showToast(e.message||"No se pudieron cargar los cupones.","error");}
        }
    });
});


document.getElementById("orders-select-all")?.addEventListener("change",e=>setAllVisibleOrdersSelected(e.target.checked));
document.getElementById("orders-select-all-head")?.addEventListener("change",e=>setAllVisibleOrdersSelected(e.target.checked));
document.getElementById("delete-selected-orders")?.addEventListener("click",deleteSelectedOrders);

/* Delegación: la tabla puede crecer sin sumar 2-3 listeners por pedido. */
const ordersTable=document.getElementById("orders-table");
ordersTable?.addEventListener("change",event=>{
    const checkbox=event.target.closest?.(".order-checkbox");
    if(checkbox){
        const id=String(checkbox.dataset.orderId||"");
        if(id){
            if(checkbox.checked)selectedOrders.add(id);
            else selectedOrders.delete(id);
            updateOrderSelectionUI();
        }
        return;
    }

    const select=event.target.closest?.(".fulfillment-select");
    if(select){
        const id=String(select.dataset.orderId||"");
        if(id)updateFulfillment(id,select.value);
    }
});
ordersTable?.addEventListener("click",event=>{
    const button=event.target.closest?.(".order-view[data-order-id]");
    if(!button)return;
    const id=String(button.dataset.orderId||"");
    const order=pedidos.find(item=>String(item.id)===id);
    if(order)openOrder(order);
});

const categoryInput=document.getElementById("product-category");
categoryInput?.addEventListener("input",()=>{
    if(normalizeCategoryName(categoryInput.value))renderCategorySuggestions();
    else hideCategorySuggestions();
});
categoryInput?.addEventListener("keydown",event=>{
    if(event.key==="Escape"){
        hideCategorySuggestions();
        return;
    }
    if(event.key==="Enter"&&!event.shiftKey){
        const box=document.getElementById("category-suggestions");
        const first=box?.querySelector(".category-suggestion");
        if(first&&!box.hidden){
            event.preventDefault();
            first.click();
        }
    }
});

document.getElementById("category-create")?.addEventListener("click",createCategoryFromInput);

document.getElementById("category-manage-toggle")?.addEventListener("click",event=>{
    const manager=document.getElementById("category-manager");
    if(!manager)return;
    manager.hidden=!manager.hidden;
    event.currentTarget.setAttribute("aria-expanded",String(!manager.hidden));
    if(!manager.hidden)renderCategoryManager();
});

document.getElementById("category-manager-close")?.addEventListener("click",()=>{
    const manager=document.getElementById("category-manager");
    const toggle=document.getElementById("category-manage-toggle");
    if(manager)manager.hidden=true;
    toggle?.setAttribute("aria-expanded","false");
});

document.getElementById("category-delete-selected")?.addEventListener("click",()=>{
    deleteCategories(categorias.filter(item=>selectedCategories.has(String(item.id))));
});

document.getElementById("category-delete-all")?.addEventListener("click",deleteAllCategories);

document.addEventListener("pointerdown",event=>{
    if(!event.target.closest?.(".category-admin-field"))hideCategorySuggestions();
},{passive:true});

document.getElementById("product-search")?.addEventListener("input",renderProducts);
document.getElementById("product-filter")?.addEventListener("change",renderProducts);

const rerenderOrderFilters=()=>{
    selectedOrders.clear();
    renderOrders();
};
let orderSearchTimer=0;
document.getElementById("order-search")?.addEventListener("input",()=>{
    clearTimeout(orderSearchTimer);
    orderSearchTimer=setTimeout(rerenderOrderFilters,110);
});
document.getElementById("order-payment-filter")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("order-prep-filter")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("order-date-from")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("order-date-to")?.addEventListener("change",rerenderOrderFilters);
document.getElementById("export-orders")?.addEventListener("click",exportFilteredOrders);
document.getElementById("new-product-button")?.addEventListener("click",()=>{
    const productsTab=document.querySelector('.tab[data-tab="products"]');
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b===productsTab));
    document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));
    document.getElementById("products-panel").classList.add("active");
    resetProductForm();
    document.getElementById("product-form").scrollIntoView({behavior:"smooth",block:"start"});
    setTimeout(()=>document.getElementById("product-name")?.focus(),450);
});
document.getElementById("product-image-add-url")?.addEventListener("click",addUrlToGallery);
document.getElementById("product-image")?.addEventListener("keydown",e=>{
    if(e.key==="Enter"){
        e.preventDefault();
        addUrlToGallery();
    }
});
document.getElementById("product-image-file")?.addEventListener("change",e=>{
    try{
        addFilesToGallery(e.target.files);
        e.target.value="";
    }catch(error){
        showToast(error.message||"No se pudieron agregar las imágenes.","error");
        e.target.value="";
    }
});

document.getElementById("order-modal-close").addEventListener("click",closeOrder);
document.getElementById("order-modal").addEventListener("click",e=>{
    if(e.target.id==="order-modal")closeOrder();
});
document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&document.getElementById("order-modal").classList.contains("active"))closeOrder();
});

/* =========================================================
   DORADO ADMIN — SELECTS VISUALES GLOBALES
   Reemplaza todos los <select> del panel por controles propios.
   El <select> real queda sincronizado para conservar toda la lógica
   y evitar los menús nativos de Windows/macOS/Android.
   ========================================================= */
(function configurarAdminSelects(){
    const wrappers=[];
    let uid=0;

    const restoreMenu=wrapper=>{
        const menu=wrapper?._adminSelectMenu||wrapper?.querySelector?.(".admin-select-menu");
        if(!menu)return null;
        if(menu.parentElement!==wrapper)wrapper.appendChild(menu);
        menu.classList.remove("is-portaled");
        menu.removeAttribute("style");
        return menu;
    };

    const closeAll=(except=null)=>{
        wrappers.forEach(wrapper=>{
            if(wrapper===except)return;
            wrapper.classList.remove("is-open");
            const trigger=wrapper.querySelector(".admin-select-trigger");
            const menu=restoreMenu(wrapper);
            trigger?.setAttribute("aria-expanded","false");
            if(menu)menu.hidden=true;
        });
    };

    const focusOption=(menu,index)=>{
        const options=[...menu.querySelectorAll(".admin-select-option")];
        if(!options.length)return;
        const safe=Math.max(0,Math.min(options.length-1,index));
        options[safe].focus({preventScroll:true});
    };

    const enhanceSelect=select=>{
        if(!(select instanceof HTMLSelectElement)||select.dataset.adminSelect==="true")return;
        if(select.closest(".admin-select"))return;

        uid+=1;
        if(!select.id)select.id=`admin-select-native-${uid}`;

        select.dataset.adminSelect="true";
        select.classList.add("admin-native-select");
        select.tabIndex=-1;
        select.setAttribute("aria-hidden","true");

        const wrapper=document.createElement("div");
        wrapper.className="admin-select";
        wrapper.dataset.for=select.id;

        const trigger=document.createElement("button");
        trigger.type="button";
        trigger.className="admin-select-trigger";
        trigger.id=`${select.id}-trigger`;
        trigger.setAttribute("aria-haspopup","listbox");
        trigger.setAttribute("aria-expanded","false");

        const value=document.createElement("span");
        value.className="admin-select-value";

        const chevron=document.createElement("span");
        chevron.className="admin-select-chevron";
        chevron.setAttribute("aria-hidden","true");
        chevron.innerHTML='<svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></svg>';
        trigger.append(value,chevron);

        const menu=document.createElement("div");
        menu.className="admin-select-menu";
        menu.id=`${select.id}-menu`;
        menu.setAttribute("role","listbox");
        menu.setAttribute("aria-label",select.getAttribute("aria-label")||select.closest(".field")?.querySelector("label")?.textContent?.trim()||"Opciones");
        menu.hidden=true;
        trigger.setAttribute("aria-controls",menu.id);

        const render=()=>{
            const options=[...select.options];
            const selected=options.find(option=>option.value===select.value)||options[0];
            value.textContent=String(selected?.textContent||"").trim();
            menu.replaceChildren();

            options.forEach(option=>{
                const button=document.createElement("button");
                button.type="button";
                button.className="admin-select-option";
                button.dataset.value=option.value;
                button.setAttribute("role","option");

                const active=option.value===select.value;
                button.setAttribute("aria-selected",active?"true":"false");
                if(active)button.classList.add("is-selected");

                const label=document.createElement("span");
                label.textContent=String(option.textContent||"").trim();

                const check=document.createElement("span");
                check.className="admin-select-check";
                check.setAttribute("aria-hidden","true");
                check.textContent=active?"✓":"";

                button.append(label,check);

                button.addEventListener("click",()=>{
                    if(select.value!==option.value){
                        select.value=option.value;
                        select.dispatchEvent(new Event("change",{bubbles:true}));
                    }
                    render();
                    closeAll();
                    trigger.focus({preventScroll:true});
                });

                menu.appendChild(button);
            });
        };

        const positionPortaledMenu=()=>{
            if(!select.closest(".table-wrap"))return;
            const rect=trigger.getBoundingClientRect();
            const viewportGap=12;
            const preferredWidth=Math.max(rect.width,220);
            const width=Math.min(preferredWidth,window.innerWidth-viewportGap*2);
            const left=Math.min(
                Math.max(viewportGap,rect.left),
                Math.max(viewportGap,window.innerWidth-width-viewportGap)
            );

            document.body.appendChild(menu);
            menu.classList.add("is-portaled");

            const estimatedHeight=Math.min(menu.scrollHeight||280,360,window.innerHeight*.52);
            const roomBelow=window.innerHeight-rect.bottom-viewportGap;
            const roomAbove=rect.top-viewportGap;
            const openUp=roomBelow<Math.min(estimatedHeight,220)&&roomAbove>roomBelow;
            const top=openUp
                ? Math.max(viewportGap,rect.top-estimatedHeight-7)
                : Math.min(window.innerHeight-estimatedHeight-viewportGap,rect.bottom+7);

            Object.assign(menu.style,{
                position:"fixed",
                left:`${left}px`,
                top:`${Math.max(viewportGap,top)}px`,
                width:`${width}px`,
                maxWidth:`${window.innerWidth-viewportGap*2}px`,
                maxHeight:`${Math.min(360,window.innerHeight*.52)}px`,
                zIndex:"10000"
            });
        };

        const open=()=>{
            render();
            closeAll(wrapper);
            wrapper.classList.add("is-open");
            menu.hidden=false;
            trigger.setAttribute("aria-expanded","true");
            positionPortaledMenu();
            const selectedIndex=Math.max(0,[...select.options].findIndex(option=>option.value===select.value));
            requestAnimationFrame(()=>focusOption(menu,selectedIndex));
        };

        const close=()=>{
            wrapper.classList.remove("is-open");
            const restored=restoreMenu(wrapper);
            if(restored)restored.hidden=true;
            trigger.setAttribute("aria-expanded","false");
        };

        trigger.addEventListener("click",()=>menu.hidden?open():close());
        trigger.addEventListener("keydown",event=>{
            if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
                event.preventDefault();
                open();
                const count=menu.querySelectorAll(".admin-select-option").length;
                if(event.key==="End")focusOption(menu,count-1);
                else if(event.key==="ArrowUp")focusOption(menu,Math.max(0,select.selectedIndex-1));
                else focusOption(menu,event.key==="Home"?0:select.selectedIndex);
            }
        });

        menu.addEventListener("keydown",event=>{
            const options=[...menu.querySelectorAll(".admin-select-option")];
            const current=options.indexOf(document.activeElement);
            if(event.key==="Escape"){
                event.preventDefault();
                close();
                trigger.focus({preventScroll:true});
                return;
            }
            if(event.key==="Tab"){
                close();
                return;
            }
            if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
            event.preventDefault();
            if(event.key==="Home")return focusOption(menu,0);
            if(event.key==="End")return focusOption(menu,options.length-1);
            focusOption(menu,Math.max(0,current+(event.key==="ArrowDown"?1:-1)));
        });

        select.addEventListener("change",render);

        const label=document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
        if(label)label.setAttribute("for",trigger.id);

        select.insertAdjacentElement("afterend",wrapper);
        wrapper.append(trigger,menu);
        wrapper._adminSelectMenu=menu;
        wrappers.push(wrapper);

        select._adminSelectRender=render;
        render();
    };

    const scan=root=>{
        if(root instanceof HTMLSelectElement)enhanceSelect(root);
        root?.querySelectorAll?.("select").forEach(enhanceSelect);
    };

    window.__doradoRefreshAdminSelects=()=>{
        document.querySelectorAll("select[data-admin-select='true']").forEach(select=>{
            select._adminSelectRender?.();
        });
    };

    scan(document);

    const observer=new MutationObserver(records=>{
        for(const record of records){
            record.addedNodes.forEach(node=>{
                if(node.nodeType===1)scan(node);
            });
        }
    });
    observer.observe(document.body,{childList:true,subtree:true});

    document.addEventListener("pointerdown",event=>{
        if(event.target.closest?.(".admin-select")||event.target.closest?.(".admin-select-menu"))return;
        closeAll();
    },{passive:true});

    window.addEventListener("resize",()=>closeAll(),{passive:true});
    window.addEventListener("scroll",()=>closeAll(),{passive:true,capture:true});
})();

/* Adaptación de coste visual sin quitar datos, controles ni entradas por scroll. */
(function detectarCapacidadAdmin(){
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    const memory=Number(navigator.deviceMemory||0);
    const cores=Number(navigator.hardwareConcurrency||0);
    const saveData=Boolean(connection?.saveData);
    const low=saveData||(memory>0&&memory<=4)||(cores>0&&cores<=4);
    document.documentElement.classList.toggle("admin-low-power",low);
})();

(async function boot(){
    try{
        await loadConfig();
        if(await handleRecoveryCallback())return;

        session=readSession();
        if(!session)return;
        if(!await verifyAdmin()){
            logout(false);
            return;
        }
        showApp();
        await loadProducts();
    }catch(e){
        console.error(e);
        logout(false);
    }
})();


/* Libera previews temporales del editor al salir del panel. */
window.addEventListener("beforeunload",releaseDraftPreviews,{once:true});


/* =========================================================
   DORADO ADMIN — SCROLL MOTION V2
   Entradas alternadas tipo editorial/Apple. Se ejecutan una sola vez,
   usan sólo transform + opacity y respetan reduced motion.
   ========================================================= */
(function configurarAdminScrollMotion(){
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
    const canObserve="IntersectionObserver" in window;
    document.documentElement.classList.add("admin-motion-enhanced");

    let observer=null;
    const watched=new WeakSet();

    const reveal=el=>{
        if(!el)return;
        el.classList.add("admin-motion-visible");
        observer?.unobserve(el);
    };

    const watch=(el,direction="up",delay=0)=>{
        if(!el||watched.has(el))return;
        watched.add(el);
        el.classList.add("admin-motion-item",`admin-motion-${direction}`);
        el.style.setProperty("--admin-motion-delay",`${Math.min(Math.max(0,delay),180)}ms`);

        if(reduce.matches||!canObserve){
            reveal(el);
            return;
        }

        const rect=el.getBoundingClientRect();
        const visible=rect.width>0&&rect.height>0&&rect.top<innerHeight*.88&&rect.bottom>0;
        if(visible){
            requestAnimationFrame(()=>reveal(el));
        }else{
            observer?.observe(el);
        }
    };

    if(!reduce.matches&&canObserve){
        observer=new IntersectionObserver(entries=>{
            for(const entry of entries){
                if(entry.isIntersecting)reveal(entry.target);
            }
        },{threshold:.12,rootMargin:"0px 0px -12% 0px"});
    }

    const registerPanel=panel=>{
        if(!panel)return;
        const hero=document.querySelector(".hero-head");
        if(hero)watch(hero,"scale",0);

        panel.querySelectorAll(":scope > .stats .stat").forEach((el,index)=>{
            watch(el,["left","up","right"][index%3],Math.min(index*45,135));
        });

        const major=Array.from(panel.querySelectorAll(":scope > .grid > .card, :scope > .grid > .form-card, :scope > .card, :scope > .catalog-card, :scope > .orders-card"));
        major.forEach((el,index)=>watch(el,index%2===0?"left":"right",Math.min(index*55,110)));
    };

    document.querySelectorAll(".panel").forEach(registerPanel);

    /* Hidden tabs get geometry only when activated. Registering again is cheap
       because WeakSet prevents duplicate observers/listeners. */
    document.addEventListener("click",event=>{
        const tab=event.target.closest?.(".tab[data-tab]");
        if(!tab)return;
        requestAnimationFrame(()=>{
            const panel=document.getElementById(`${tab.dataset.tab}-panel`);
            registerPanel(panel);
            panel?.querySelectorAll(".admin-motion-item").forEach(el=>{
                if(el.classList.contains("admin-motion-visible"))return;
                const rect=el.getBoundingClientRect();
                if(rect.width>0&&rect.height>0&&rect.top<innerHeight*.9&&rect.bottom>0)reveal(el);
            });
        });
    },{passive:true});

    reduce.addEventListener?.("change",()=>{
        if(reduce.matches){
            document.querySelectorAll(".admin-motion-item").forEach(reveal);
            observer?.disconnect();
        }
    });
})();
