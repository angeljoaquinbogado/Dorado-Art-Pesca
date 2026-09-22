const SESSION_KEY = "doradoAdminSession";
let CONFIG = null;
let session = null;
let productos = [];
let pedidos = [];
let selectedOrders = new Set();
let productGalleryDraft = [];
let refreshPromise = null;

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
        "logo-2.PNG":"assets/images/brand/logo-dorado.png",
        "/logo-2.PNG":"assets/images/brand/logo-dorado.png",
        "logo.PNG":"assets/images/brand/logo-dorado.png",
        "/logo.PNG":"assets/images/brand/logo-dorado.png",
        "logo.jpg":"assets/images/brand/logo-dorado.png",
        "/logo.jpg":"assets/images/brand/logo-dorado.png",
        "auriculares 2.PNG":"assets/images/brand/logo-dorado.png",
        "/auriculares 2.PNG":"assets/images/brand/logo-dorado.png",
        "assets/images/brand/logo-dorado.png":"assets/images/brand/logo-dorado.png",
        "/assets/images/brand/logo-dorado.png":"assets/images/brand/logo-dorado.png",
        "assets/images/products/auriculares-2.png":"assets/images/brand/logo-dorado.png",
        "/assets/images/products/auriculares-2.png":"assets/images/brand/logo-dorado.png"
    };
    return legacy[value]||value||"assets/images/brand/logo-dorado.png";
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
                <img src="${esc(item.preview||item.url||"")}" alt="Imagen ${index+1} del producto">
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
        const r=await sb("/rest/v1/productos?select=id,nombre,descripcion,caracteristicas,precio,imagen,imagenes,categoria,stock,activo&order=id.asc",{
            headers:{Range:`${from}-${to}`,"Range-Unit":"items"}
        });
        const d=await r.json().catch(()=>[]);
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

    filtered.forEach(p=>{
        const tr=document.createElement("tr");
        const stock=Math.max(0,Number(p.stock)||0);
        const stockClass=stock===0?"stock-out":stock<=3?"stock-low":"stock-ok";
        const stockText=stock===0?"SIN STOCK":stock<=3?`${stock} · BAJO`:`${stock}`;
        tr.innerHTML=`
            <td><div class="thumb-shell"><img class="product-thumb" src="${esc(resolveAdminImage(p.imagen))}" alt="" loading="lazy" decoding="async"></div></td>
            <td><strong class="product-name-cell">${esc(p.nombre)}</strong><div class="cell-sub">${esc(p.categoria||"Sin categoría")}</div></td>
            <td><strong class="price-cell">${esc(money.format(Number(p.precio)||0))}</strong></td>
            <td><span class="stock-pill ${stockClass}">${stockText}</span></td>
            <td><span class="badge ${p.activo?"on":"off"}">${p.activo?"ACTIVO":"OCULTO"}</span></td>
            <td><div class="row-actions"><button class="icon-btn edit" type="button">${icon("edit")}<span>EDITAR</span></button><button class="icon-btn remove" type="button">${icon("trash")}<span>ELIMINAR</span></button></div></td>
        `;
        tr.querySelector(".edit").onclick=()=>editProduct(p.id);
        tr.querySelector(".remove").onclick=()=>deleteProduct(p.id,p.nombre);
        tbody.appendChild(tr);
    });
}

function resetProductForm(){
    document.getElementById("product-form").reset();
    document.getElementById("product-id").value="";
    document.getElementById("product-active").value="true";
    document.getElementById("product-form-title").textContent="Nuevo producto";
    document.getElementById("product-save").textContent="GUARDAR PRODUCTO";
    document.getElementById("product-cancel").classList.add("hidden");
    resetProductGallery();
    msg("product-message","");
}

function editProduct(id){
    const p=productos.find(x=>String(x.id)===String(id));
    if(!p)return;
    document.getElementById("product-id").value=p.id;
    document.getElementById("product-name").value=p.nombre||"";
    document.getElementById("product-description").value=p.descripcion||"";
    document.getElementById("product-features").value=p.caracteristicas||"";
    document.getElementById("product-price").value=Number(p.precio)||0;
    document.getElementById("product-stock").value=Number(p.stock)||0;
    document.getElementById("product-category").value=p.categoria||"";
    document.getElementById("product-image").value="";
    document.getElementById("product-active").value=String(Boolean(p.activo));
    document.getElementById("product-form-title").textContent="Editar producto";
    document.getElementById("product-save").textContent="GUARDAR CAMBIOS";
    document.getElementById("product-cancel").classList.remove("hidden");
    resetProductGallery(p);
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
            imagenes.push("assets/images/brand/logo-dorado.png");
        }

        const payload={
            nombre:document.getElementById("product-name").value.trim(),
            descripcion:document.getElementById("product-description").value.trim(),
            caracteristicas:document.getElementById("product-features").value.trim(),
            precio:Number(document.getElementById("product-price").value),
            stock:Math.max(0,Math.floor(Number(document.getElementById("product-stock").value)||0)),
            categoria:document.getElementById("product-category").value.trim(),
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

    const header=["Pedido","Fecha","Cliente","Email","Teléfono","Total ARS","Pago","Preparación","Ciudad","Provincia"];
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
        const checkbox=tr.querySelector(".order-checkbox");
        checkbox?.addEventListener("change",()=>{
            const id=String(o.id);
            if(checkbox.checked)selectedOrders.add(id);
            else selectedOrders.delete(id);
            updateOrderSelectionUI();
        });
        tr.querySelector(".fulfillment-select")?.addEventListener("change",e=>updateFulfillment(o.id,e.target.value));
        tr.querySelector(".order-view")?.addEventListener("click",()=>openOrder(o));
        tbody.appendChild(tr);
    });

    updateOrderSelectionUI();
}

async function loadOrders(){
    const tbody=document.getElementById("orders-table");
    selectedOrders.clear();
    tbody.innerHTML='<tr><td colspan="8" class="loading">Cargando pedidos...</td></tr>';
    updateOrderSelectionUI();

    const r=await sb("/rest/v1/pedidos?select=id,created_at,cliente_nombre,cliente_email,cliente_telefono,domicilio,ciudad,provincia,codigo_postal,metodo_entrega,notas,total,estado,preparacion_estado,tracking_token&order=created_at.desc&limit=300");
    const d=await r.json().catch(()=>[]);
    if(!r.ok)throw new Error("No se pudieron cargar los pedidos.");

    pedidos=Array.isArray(d)?d:[];

    const totalEl=document.getElementById("order-stat-total");
    const paidEl=document.getElementById("order-stat-paid");
    const pendingEl=document.getElementById("order-stat-pending");
    if(totalEl)totalEl.textContent=pedidos.length;
    if(paidEl)paidEl.textContent=pedidos.filter(o=>orderPaymentGroup(o.estado)==="pagado").length;
    if(pendingEl)pendingEl.textContent=pedidos.filter(o=>orderPaymentGroup(o.estado)==="pendiente").length;

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
                <div><span>TOTAL</span><strong>${esc(money.format(Number(order.total)||0))}</strong></div>
                <div><span>PAGO</span><strong>${esc(orderStatusLabel(order.estado))}</strong></div>
                <div><span>PREPARACIÓN</span><strong>${esc(String(order.preparacion_estado||"nuevo").toUpperCase())}</strong></div>
            </div>
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

async function refreshAll(){
    const current=document.querySelector(".tab.active")?.dataset.tab;
    try{
        if(current==="orders")await loadOrders();
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
    }catch(err){
        msg("login-message",err.message||"No se pudo iniciar sesión.");
    }finally{
        button.disabled=false;
    }
});

document.getElementById("product-form").addEventListener("submit",saveProduct);
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
        }
    });
});


document.getElementById("orders-select-all")?.addEventListener("change",e=>setAllVisibleOrdersSelected(e.target.checked));
document.getElementById("orders-select-all-head")?.addEventListener("change",e=>setAllVisibleOrdersSelected(e.target.checked));
document.getElementById("delete-selected-orders")?.addEventListener("click",deleteSelectedOrders);

document.getElementById("product-search")?.addEventListener("input",renderProducts);
document.getElementById("product-filter")?.addEventListener("change",renderProducts);

const rerenderOrderFilters=()=>{
    selectedOrders.clear();
    renderOrders();
};
document.getElementById("order-search")?.addEventListener("input",rerenderOrderFilters);
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

(async function boot(){
    try{
        await loadConfig();
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
