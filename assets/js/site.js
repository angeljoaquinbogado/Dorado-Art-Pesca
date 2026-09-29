/* Perfil de capacidad: conserva contenido/controles y ajusta sólo coste visual. */
const DORADO_DEVICE_PROFILE = (()=>{
    const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    const memory=Number(navigator.deviceMemory||0);
    const cores=Number(navigator.hardwareConcurrency||0);
    const saveData=Boolean(connection?.saveData);
    const veryLow=saveData||(memory>0&&memory<=2)||(cores>0&&cores<=2);
    const low=veryLow||((memory>0&&memory<=4)&&(cores>0&&cores<=4));
    document.documentElement.classList.toggle("low-power-device",low);
    document.documentElement.classList.toggle("very-low-power-device",veryLow);
    return {low,veryLow,saveData,memory,cores};
})();

function ejecutarCuandoHayaTiempo(callback,timeout=1400){
    if("requestIdleCallback" in window){
        window.requestIdleCallback(()=>callback(),{timeout});
    }else{
        window.setTimeout(callback,DORADO_DEVICE_PROFILE.low?420:120);
    }
}

const DORADO_CART_KEY = "doradoCarrito";
const DORADO_ORDERS_KEY = "doradoMisPedidos";
const DORADO_WHATSAPP = "5491168070039";

const catalogoProductos = new Map();
let productoModalActual = null;
let checkoutCoupon = null;
let doradoPublicConfigPromise = null;
let marcaActiva = "todas";
let catalogoExpandido = false;
let marcasExpandidas = false;
const CATALOG_INITIAL_LIMIT = 12;

const DORADO_BRANDS = [
    { name:"Shimano", key:"shimano", sprite:0 },
    { name:"Albatros", key:"albatros", sprite:1 },
    { name:"TICA", key:"tica", sprite:2 },
    { name:"Caster", key:"caster", sprite:3 },
    { name:"Bando ARG", key:"bando-arg", sprite:4 },
    { name:"Fox Airguns", key:"fox-airguns", sprite:5 },
    { name:"Payo", key:"payo", sprite:6 },
    { name:"MorGui Outdoor", key:"morgui-outdoor", sprite:7 },
    { name:"Surfish", key:"surfish", sprite:8 }
];

function marcaDefPorClave(key){
    return DORADO_BRANDS.find(item=>item.key===String(key||""))||null;
}

function spritePosition(index){
    const safe=Math.max(0,Math.min(DORADO_BRANDS.length-1,Number(index)||0));
    return `${(safe/(DORADO_BRANDS.length-1))*100}%`;
}

function obtenerConfigPublica(){
    if(!doradoPublicConfigPromise){
        doradoPublicConfigPromise = fetch("/api/public-config", {
            headers:{Accept:"application/json"}
        }).then(async response=>{
            const data=await response.json().catch(()=>({}));
            if(!response.ok) throw new Error(data?.error||"No se pudo cargar la configuración pública.");
            return data;
        }).catch(error=>{
            doradoPublicConfigPromise=null;
            throw error;
        });
    }
    return doradoPublicConfigPromise;
}

const DORADO_THEME_KEY="doradoStoreThemePreference";
const DORADO_THEME_VALUES=new Set(["default","light","dark"]);
let doradoSiteDefaultTheme="light";

function normalizeStoreTheme(value){
    const theme=String(value||"default").toLowerCase();
    return DORADO_THEME_VALUES.has(theme)?theme:"default";
}

function resolveStoreTheme(preference){
    const requested=normalizeStoreTheme(preference);
    const configured=normalizeStoreTheme(doradoSiteDefaultTheme);
    const defaultResolved=configured==="dark"?"dark":"light";
    if(requested==="default")return defaultResolved;
    return requested==="dark"?"dark":"light";
}

function syncStoreThemeControls(preference,resolved){
    const normalized=normalizeStoreTheme(preference);
    document.querySelectorAll("[data-store-theme-choice]").forEach(button=>{
        const active=button.dataset.storeThemeChoice===normalized;
        button.classList.toggle("active",active);
        button.setAttribute("aria-pressed",String(active));
    });

    const globalResolved=resolveStoreTheme("default");
    const defaultLabel=document.getElementById("store-theme-default-label");
    if(defaultLabel)defaultLabel.textContent=`Predeterminado (${globalResolved==="dark"?"oscuro":"claro"})`;

    const status=document.getElementById("store-theme-status");
    if(status)status.textContent=`Tema actual: ${resolved==="dark"?"oscuro":"claro"}`;
}

function applyStoreTheme(preference,{persist=false,animate=false}={}){
    const normalized=normalizeStoreTheme(preference);
    const resolved=resolveStoreTheme(normalized);
    const root=document.documentElement;
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if(persist){
        try{localStorage.setItem(DORADO_THEME_KEY,normalized);}catch{}
    }

    if(animate&&!reduce){
        root.classList.add("store-theme-transitioning");
        window.clearTimeout(applyStoreTheme._timer);
        applyStoreTheme._timer=window.setTimeout(()=>root.classList.remove("store-theme-transitioning"),240);
    }

    root.dataset.storeTheme=resolved;
    root.dataset.storeThemePreference=normalized;
    root.style.colorScheme=resolved;

    const meta=document.getElementById("store-theme-color");
    if(meta)meta.setAttribute("content",resolved==="dark"?"#10212d":"#f7f4ec");

    syncStoreThemeControls(normalized,resolved);
}

async function configureStoreTheme(){
    let localPreference="default";
    try{localPreference=normalizeStoreTheme(localStorage.getItem(DORADO_THEME_KEY)||"default");}catch{}

    try{
        const config=await obtenerConfigPublica();
        doradoSiteDefaultTheme=normalizeStoreTheme(config?.siteThemeDefault||"light");
    }catch{
        doradoSiteDefaultTheme="light";
    }

    try{
        localStorage.setItem("doradoStoreSiteDefaultTheme",resolveStoreTheme("default"));
    }catch{}

    applyStoreTheme(localPreference,{animate:false});

    document.querySelectorAll("[data-store-theme-choice]").forEach(button=>{
        button.addEventListener("click",()=>{
            applyStoreTheme(button.dataset.storeThemeChoice,{persist:true,animate:true});
        });
    });

    window.addEventListener("storage",event=>{
        if(event.key==="doradoStoreSiteDefaultTheme"){
            doradoSiteDefaultTheme=normalizeStoreTheme(event.newValue||"light");
            const current=normalizeStoreTheme(localStorage.getItem(DORADO_THEME_KEY)||"default");
            if(current==="default")applyStoreTheme("default",{animate:true});
            else syncStoreThemeControls(current,resolveStoreTheme(current));
            return;
        }
        if(event.key===DORADO_THEME_KEY){
            applyStoreTheme(event.newValue||"default",{animate:true});
        }
    });
}

void configureStoreTheme();

const formatoPesos = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
});

function formatearPrecio(valor) {
    const numero = Number(valor);
    return formatoPesos.format(Number.isFinite(numero) ? numero : 0);
}

function textoSeguro(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function descripcionResumen(valor) {
    return String(valor ?? "")
        .replace(/\*\*/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function descripcionFormateada(valor) {
    const contenido = textoSeguro(valor || "Consultá las características de este producto.")
        .replace(/\r\n/g, "\n");

    const aplicarNegrita = (texto) =>
        texto.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    const lineas = contenido.split("\n");
    let html = "";
    let listaAbierta = false;

    const cerrarLista = () => {
        if (listaAbierta) {
            html += "</ul>";
            listaAbierta = false;
        }
    };

    for (const lineaOriginal of lineas) {
        const linea = lineaOriginal.trim();

        if (/^-\s+/.test(linea)) {
            if (!listaAbierta) {
                html += '<ul class="description-list">';
                listaAbierta = true;
            }

            html += `<li>${aplicarNegrita(linea.replace(/^-\s+/, ""))}</li>`;
            continue;
        }

        cerrarLista();

        if (!linea) {
            html += '<div class="description-space" aria-hidden="true"></div>';
        } else {
            html += `<p>${aplicarNegrita(linea)}</p>`;
        }
    }

    cerrarLista();
    return html;
}

function caracteristicasFormateadas(valor) {
    const lineas = String(valor ?? "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map(linea => linea.trim().replace(/^[-•*]\s*/, ""))
        .filter(Boolean);

    if (!lineas.length) return "";

    return `<ul class="product-features-list">${lineas
        .map(linea => `<li>${textoSeguro(linea).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</li>`)
        .join("")}</ul>`;
}

function imagenSegura(valor) {
    const imagen = String(valor || "").trim();
    const legacyAssets = {
        "logo-2.PNG": "assets/images/brand/logo-dorado-640.webp",
        "/logo-2.PNG": "assets/images/brand/logo-dorado-640.webp",
        "logo.PNG": "assets/images/brand/logo-dorado-640.webp",
        "/logo.PNG": "assets/images/brand/logo-dorado-640.webp",
        "logo.jpg": "assets/images/brand/logo-dorado-640.webp",
        "/logo.jpg": "assets/images/brand/logo-dorado-640.webp",
        "auriculares 2.PNG": "assets/images/brand/logo-dorado-640.webp",
        "/auriculares 2.PNG": "assets/images/brand/logo-dorado-640.webp",
        "hero-bg-dorado.png": "assets/images/backgrounds/hero-bg-dorado.webp",
        "/hero-bg-dorado.png": "assets/images/backgrounds/hero-bg-dorado.webp",
        "assets/images/backgrounds/hero-bg-dorado.png": "assets/images/backgrounds/hero-bg-dorado.webp",
        "/assets/images/backgrounds/hero-bg-dorado.png": "assets/images/backgrounds/hero-bg-dorado.webp",
        "assets/images/brand/logo-dorado-640.webp": "assets/images/brand/logo-dorado-640.webp",
        "/assets/images/brand/logo-dorado-640.webp": "assets/images/brand/logo-dorado-640.webp",
        "assets/images/products/auriculares-2.png": "assets/images/brand/logo-dorado-640.webp",
        "/assets/images/products/auriculares-2.png": "assets/images/brand/logo-dorado-640.webp"
    };

    if (!imagen) return "assets/images/brand/logo-dorado-640.webp";
    if (legacyAssets[imagen]) return legacyAssets[imagen];

    if (
        imagen.startsWith("https://") ||
        imagen.startsWith("http://") ||
        imagen.startsWith("/") ||
        imagen.startsWith("./") ||
        imagen.startsWith("../") ||
        !imagen.includes(":")
    ) {
        return imagen;
    }

    return "assets/images/brand/logo-dorado-640.webp";
}

function leerCarrito() {
    try {
        const guardado = JSON.parse(localStorage.getItem(DORADO_CART_KEY));
        return Array.isArray(guardado) ? guardado : [];
    } catch (error) {
        return [];
    }
}

function guardarCarrito(carrito) {
    localStorage.setItem(DORADO_CART_KEY, JSON.stringify(carrito));
    renderCarrito();
}

function cantidadTotal(carrito = leerCarrito()) {
    return carrito.reduce(
        (total, item) => total + Math.max(0, Number(item.cantidad) || 0),
        0
    );
}

function obtenerCantidad(input, maximo) {
    const max = Math.max(1, Number(maximo) || 1);
    const valor = Math.floor(Number(input?.value) || 1);
    const cantidad = Math.min(max, Math.max(1, valor));

    if (input) input.value = cantidad;

    return cantidad;
}

function actualizarBotonesCantidad(contenedor, maximo) {
    if (!contenedor) return;

    const input = contenedor.querySelector(".qty-input");
    const menos = contenedor.querySelector('[data-qty-action="minus"]');
    const mas = contenedor.querySelector('[data-qty-action="plus"]');

    if (!input) return;

    const max = Math.max(1, Number(maximo) || 1);
    const cantidad = obtenerCantidad(input, max);

    if (menos) menos.disabled = cantidad <= 1;
    if (mas) mas.disabled = cantidad >= max;
}

function configurarSelectorCantidad(contenedor, maximo, alCambiar = null) {
    if (!contenedor) return;

    const input = contenedor.querySelector(".qty-input");
    const menos = contenedor.querySelector('[data-qty-action="minus"]');
    const mas = contenedor.querySelector('[data-qty-action="plus"]');

    if (!input) return;

    const max = Math.max(1, Number(maximo) || 1);
    input.min = "1";
    input.max = String(max);

    const aplicar = (nuevaCantidad) => {
        input.value = Math.min(max, Math.max(1, Math.floor(nuevaCantidad || 1)));
        actualizarBotonesCantidad(contenedor, max);
        if (typeof alCambiar === "function") {
            alCambiar(Number(input.value));
        }
    };

    if (menos) {
        menos.onclick = () => aplicar(Number(input.value) - 1);
    }

    if (mas) {
        mas.onclick = () => aplicar(Number(input.value) + 1);
    }

    input.onchange = () => aplicar(Number(input.value));
    input.onblur = () => aplicar(Number(input.value));

    actualizarBotonesCantidad(contenedor, max);
}


async function cargarMasElegidos(){
    const section=document.getElementById("mas-elegidos");
    const grid=document.getElementById("best-sellers-grid");
    if(!section||!grid)return;
    try{
        const response=await fetch("/api/best-sellers",{headers:{Accept:"application/json"},cache:"default"});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!Array.isArray(data.ids))return;
        const products=data.ids.map(id=>catalogoProductos.get(String(id))).filter(Boolean).filter(product=>Math.max(0,Number(product.stock)||0)>0).slice(0,6);
        if(!products.length)return;
        grid.innerHTML="";
        products.forEach(product=>{
            const button=document.createElement("button");
            button.type="button";
            button.className="best-seller-card";
            button.innerHTML=`
                <img src="${textoSeguro(imagenSegura(product.imagen))}" alt="" loading="lazy" decoding="async">
                <span class="best-seller-category">${textoSeguro(product.categoria||"Producto")}</span>
                <strong>${textoSeguro(product.nombre||"Producto")}</strong>
                <span class="best-seller-price">${textoSeguro(formatearPrecio(product.precio))}</span>
                <span class="best-seller-action">VER PRODUCTO →</span>
            `;
            button.addEventListener("click",()=>verProducto(product));
            grid.appendChild(button);
        });
        section.hidden=false;
    }catch{
        section.hidden=true;
    }
}

async function cargarProductosDesdeSupabase() {
    const contenedor = document.getElementById("products-grid");

    if (!contenedor) return;

    let productos = null;
    let ultimoError = null;

    // El catálogo público se entrega desde nuestro propio backend.
    // Reintentamos para cubrir funciones frías o cortes breves de red.
    for (let intento = 0; intento < 3 && !productos; intento += 1) {
        try {
            const controller = new AbortController();
            const timer = window.setTimeout(() => controller.abort(), 10000);

            let respuesta;
            try {
                respuesta = await fetch("/api/products", {
                    method: "GET",
                    headers: {
                        "Accept": "application/json"
                    },
                    cache: "default",
                    signal: controller.signal
                });
            } finally {
                window.clearTimeout(timer);
            }

            const data = await respuesta.json().catch(() => null);

            if (!respuesta.ok || !Array.isArray(data)) {
                throw new Error(data?.error || `No se pudo cargar el catálogo (${respuesta.status})`);
            }

            productos = data;
        } catch (error) {
            ultimoError = error;
            if (intento < 2) {
                await new Promise(resolve => window.setTimeout(resolve, 650 + intento * 450));
            }
        }
    }

    if (!Array.isArray(productos)) {
        console.error("Error cargando productos:", ultimoError);
        const count = document.getElementById("product-result-count");
        if (count) count.textContent = "Catálogo temporalmente no disponible";
        contenedor.innerHTML = `
            <div class="products-loading">
                <div class="catalog-error-state">
                    <strong>No pudimos cargar el catálogo.</strong>
                    <span>Probá nuevamente. Si el problema continúa, la tienda sigue disponible por WhatsApp.</span>
                    <button class="catalog-retry-btn" type="button">REINTENTAR</button>
                </div>
            </div>
        `;
        contenedor.querySelector(".catalog-retry-btn")?.addEventListener("click", () => {
            contenedor.innerHTML = '<div class="products-loading"><span class="catalog-loader-dot" aria-hidden="true"></span><span>Cargando catálogo…</span></div>';
            if (count) count.textContent = "Cargando catálogo…";
            cargarProductosDesdeSupabase();
        });
        return;
    }

    try {
        catalogoProductos.clear();

        const productsFragment=document.createDocumentFragment();

        productos.forEach(producto => {
            catalogoProductos.set(String(producto.id), producto);
        });

        sincronizarCarritoConCatalogo();

        contenedor.innerHTML = "";

        if (productos.length === 0) {
            contenedor.innerHTML = `
                <div class="products-loading">
                    No hay productos disponibles.
                </div>
            `;
            return;
        }

        productos.forEach(producto => {
            const tarjeta = document.createElement("article");
            tarjeta.className = "product";
            tarjeta.dataset.category = String(producto.categoria || "").trim();
            tarjeta.dataset.categoryKey = normalizarClaveCategoria(producto.categoria);
            tarjeta.dataset.brand = String(producto.marca || "").trim();
            tarjeta.dataset.brandKey = normalizarClaveMarca(producto.marca);
            tarjeta.dataset.search = normalizarTextoBusqueda([
                producto.nombre || "",
                producto.categoria || "",
                producto.marca || "",
                producto.descripcion || "",
                producto.caracteristicas || ""
            ].join(" "));

            const stock = Math.max(0, Number(producto.stock) || 0);
            const sinStock = stock <= 0;
            const imagen = imagenSegura(producto.imagen);

            tarjeta.innerHTML = `
                <div class="product-img">
                    <div class="badge">
                        ${textoSeguro(producto.categoria || "PRODUCTO")}
                    </div>

                    <img
                        src="${textoSeguro(imagen)}"
                        alt="${textoSeguro(producto.nombre || "Producto")}"
                        class="product-real-image"
                        loading="lazy"
                        decoding="async"
                    >
                </div>

                <div class="product-info">
                    <h3>${textoSeguro(producto.nombre || "Producto")}</h3>

                    <p class="product-card-description">${textoSeguro(descripcionResumen(producto.descripcion || ""))}</p>

                    <div class="product-price ${Number(producto.descuento_porcentaje)>0?"has-discount":""}">
                        ${Number(producto.descuento_porcentaje)>0
                            ? `<span class="product-price-old">${textoSeguro(formatearPrecio(producto.precio_original))}</span><span class="product-price-current">${textoSeguro(formatearPrecio(producto.precio))}</span><span class="product-discount-badge">-${Math.round(Number(producto.descuento_porcentaje)||0)}%</span>`
                            : `<span class="product-price-current">${textoSeguro(formatearPrecio(producto.precio))}</span>`}
                    </div>

                    <div class="product-stock">
   
                    ${sinStock
       
                        ? "SIN STOCK"
        
                        : stock === 1
           
                        ? "🔥 ¡Última unidad!"
           
                        : stock <= 3
               
                        ? `🔥 ¡Últimas ${stock} unidades!`
                
                        : `${stock} disponibles`
  
                    }

                    </div>

                    <div class="product-actions">
                        <button
                            type="button"
                            class="view-product"
                        >
                            Ver producto <svg class="ui-icon" aria-hidden="true"><use href="#i-chevron"></use></svg>
                        </button>

                        <div class="card-quantity-row">
                            <span>CANTIDAD</span>

                            <div class="quantity-selector card-quantity-selector">
                                <button
                                    type="button"
                                    class="qty-btn"
                                    data-qty-action="minus"
                                    aria-label="Restar una unidad"
                                    ${sinStock ? "disabled" : ""}
                                ><svg class="ui-icon" aria-hidden="true"><use href="#i-minus"></use></svg></button>

                                <input
                                    class="qty-input"
                                    type="number"
                                    min="1"
                                    max="${Math.max(1, stock)}"
                                    value="1"
                                    inputmode="numeric"
                                    aria-label="Cantidad de unidades"
                                    ${sinStock ? "disabled" : ""}
                                >

                                <button
                                    type="button"
                                    class="qty-btn"
                                    data-qty-action="plus"
                                    aria-label="Sumar una unidad"
                                    ${sinStock ? "disabled" : ""}
                                ><svg class="ui-icon" aria-hidden="true"><use href="#i-plus"></use></svg></button>
                            </div>
                        </div>

                        <button
                            type="button"
                            class="gold-btn add-card-product"
                            ${sinStock ? "disabled" : ""}
                        >
                            ${sinStock ? "SIN STOCK" : '<svg class="ui-icon" aria-hidden="true"><use href="#i-cart"></use></svg><span>Agregar al carrito</span>'}
                        </button>
                    </div>
                </div>
            `;

            const productImage = tarjeta.querySelector(".product-real-image");
            productImage?.addEventListener("error",()=>{
                if(productImage.dataset.fallbackApplied === "1") return;
                productImage.dataset.fallbackApplied = "1";
                productImage.src = "assets/images/brand/logo-dorado-640.webp";
                productImage.classList.add("is-fallback-logo");
            },{once:true});

            const botonVer = tarjeta.querySelector(".view-product");
            const botonAgregar = tarjeta.querySelector(".add-card-product");
            const selector = tarjeta.querySelector(".card-quantity-selector");
            const input = selector?.querySelector(".qty-input");

            botonVer?.addEventListener("click", event => {
                event.stopPropagation();
                verProducto(producto);
            });

            tarjeta.tabIndex=0;
            tarjeta.setAttribute("role","button");
            tarjeta.setAttribute("aria-label",`Ver detalles de ${producto.nombre||"producto"}`);
            tarjeta.addEventListener("click",event=>{
                if(event.target.closest("button,input,a,.quantity-selector"))return;
                verProducto(producto);
            });
            tarjeta.addEventListener("keydown",event=>{
                if(event.target!==tarjeta)return;
                if(event.key==="Enter"||event.key===" "){
                    event.preventDefault();
                    verProducto(producto);
                }
            });

            if (!sinStock && selector && input) {
                configurarSelectorCantidad(selector, stock);

                botonAgregar?.addEventListener("click", () => {
                    const cantidad = obtenerCantidad(input, stock);
                    agregarAlCarrito(producto, cantidad);
                    input.value = "1";
                    actualizarBotonesCantidad(selector, stock);
                });
            }

            productsFragment.appendChild(tarjeta);
        });

        contenedor.appendChild(productsFragment);

        try { construirFiltrosCategorias(productos); } catch (error) { console.warn("Filtros de catálogo:", error); }
        try { construirMarcas(productos); } catch (error) { console.warn("Marcas del catálogo:", error); }
        try { actualizarFiltroCatalogo(); } catch (error) { console.warn("Filtro activo:", error); }
        ejecutarCuandoHayaTiempo(()=>{ try { cargarMasElegidos(); } catch (error) { console.warn("Más elegidos:", error); } },DORADO_DEVICE_PROFILE.low?1800:700);

    } catch (error) {
        // Si la respuesta llegó pero una mejora visual falla, no vaciamos el
        // catálogo que ya se alcanzó a renderizar.
        console.error("Error renderizando productos:", error);
        if (!contenedor.querySelector(".product")) {
            const count = document.getElementById("product-result-count");
            if (count) count.textContent = "Catálogo temporalmente no disponible";
            contenedor.innerHTML = `
                <div class="products-loading">
                    <div class="catalog-error-state">
                        <strong>No pudimos mostrar el catálogo.</strong>
                        <button class="catalog-retry-btn" type="button">REINTENTAR</button>
                    </div>
                </div>
            `;
            contenedor.querySelector(".catalog-retry-btn")?.addEventListener("click", cargarProductosDesdeSupabase);
        }
    }
}

function sincronizarCarritoConCatalogo() {
    if (catalogoProductos.size === 0) {
        renderCarrito();
        return;
    }

    const carrito = leerCarrito();
    let cambio = false;

    const actualizado = carrito
        .map(item => {
            const producto = catalogoProductos.get(String(item.id));

            if (!producto) {
                cambio = true;
                return null;
            }

            const stock = Math.max(0, Number(producto.stock) || 0);

            if (stock <= 0) {
                cambio = true;
                return null;
            }

            const cantidadActual = Math.max(1, Number(item.cantidad) || 1);
            const cantidad = Math.min(cantidadActual, stock);

            const nuevo = {
                id: producto.id,
                nombre: producto.nombre || "Producto",
                precio: Number(producto.precio) || 0,
                imagen: imagenSegura(producto.imagen),
                categoria: producto.categoria || "Producto",
                stock,
                cantidad
            };

            if (
                String(item.nombre) !== String(nuevo.nombre) ||
                Number(item.precio) !== nuevo.precio ||
                String(item.imagen) !== String(nuevo.imagen) ||
                Number(item.stock) !== nuevo.stock ||
                Number(item.cantidad) !== nuevo.cantidad ||
                String(item.categoria || "") !== String(nuevo.categoria)
            ) {
                cambio = true;
            }

            return nuevo;
        })
        .filter(Boolean);

    if (cambio) {
        localStorage.setItem(DORADO_CART_KEY, JSON.stringify(actualizado));
    }

    renderCarrito();
}

function imagenesProducto(producto){
    const raw=Array.isArray(producto?.imagenes)?producto.imagenes:[];
    const values=[...raw];
    if(producto?.imagen)values.unshift(producto.imagen);
    const safe=values
        .map(imagenSegura)
        .filter(Boolean);
    return [...new Set(safe)];
}

function renderGaleriaProducto(modal,producto){
    const imagenes=imagenesProducto(producto);
    const principal=modal.querySelector(".dynamic-product-image");
    const thumbs=modal.querySelector(".product-gallery-thumbs");
    const prev=modal.querySelector(".product-gallery-prev");
    const next=modal.querySelector(".product-gallery-next");

    if(!principal)return;

    let index=0;
    const show=current=>{
        if(!imagenes.length)return;
        index=(current+imagenes.length)%imagenes.length;
        principal.src=imagenes[index];
        principal.alt=`${producto.nombre||"Producto"} · imagen ${index+1}`;
        thumbs?.querySelectorAll(".product-gallery-thumb").forEach((button,i)=>{
            button.classList.toggle("active",i===index);
            button.setAttribute("aria-current",i===index?"true":"false");
        });
    };

    if(thumbs){
        thumbs.innerHTML="";
        thumbs.hidden=imagenes.length<=1;
        imagenes.forEach((src,i)=>{
            const button=document.createElement("button");
            button.type="button";
            button.className=`product-gallery-thumb ${i===0?"active":""}`;
            button.setAttribute("aria-label",`Ver imagen ${i+1} de ${producto.nombre||"producto"}`);
            button.innerHTML=`<img src="${textoSeguro(src)}" alt="" loading="lazy">`;
            button.addEventListener("click",()=>show(i));
            thumbs.appendChild(button);
        });
    }

    if(prev){
        prev.hidden=imagenes.length<=1;
        prev.onclick=()=>show(index-1);
    }
    if(next){
        next.hidden=imagenes.length<=1;
        next.onclick=()=>show(index+1);
    }

    show(0);
}


function renderProductosRelacionados(modal, producto){
    const wrap=modal.querySelector(".related-products-section");
    const grid=modal.querySelector(".related-products-grid");
    if(!wrap||!grid)return;
    const categoria=String(producto?.categoria||"").trim().toLowerCase();
    const relacionados=[...catalogoProductos.values()]
        .filter(item=>String(item.id)!==String(producto?.id))
        .filter(item=>Math.max(0,Number(item.stock)||0)>0)
        .filter(item=>!categoria||String(item.categoria||"").trim().toLowerCase()===categoria)
        .slice(0,3);
    wrap.hidden=relacionados.length===0;
    grid.innerHTML="";
    relacionados.forEach(item=>{
        const button=document.createElement("button");
        button.type="button";
        button.className="related-product-card";
        button.innerHTML=`<img src="${textoSeguro(imagenSegura(item.imagen))}" alt="" loading="lazy" decoding="async"><span><strong>${textoSeguro(item.nombre||"Producto")}</strong><small>${textoSeguro(formatearPrecio(item.precio))}</small></span>`;
        button.addEventListener("click",()=>verProducto(item));
        grid.appendChild(button);
    });
}

function verProducto(producto) {
    const modal = document.getElementById("producto-dinamico");

    if (!modal) return;

    productoModalActual = producto;
    renderProductosRelacionados(modal, producto);

    const stock = Math.max(0, Number(producto.stock) || 0);
    renderGaleriaProducto(modal, producto);

    const categoria = modal.querySelector(".dynamic-product-category");
    if (categoria) categoria.textContent = producto.categoria || "PRODUCTO";

    const nombre = modal.querySelector(".dynamic-product-name");
    if (nombre) nombre.textContent = producto.nombre || "Producto";

    const descripcion = modal.querySelector(".dynamic-product-description");
    if (descripcion) {
        descripcion.innerHTML = descripcionFormateada(producto.descripcion);
    }

    const featuresSection = modal.querySelector(".dynamic-features-section");
    const features = modal.querySelector(".dynamic-product-features");
    const featuresHtml = caracteristicasFormateadas(producto.caracteristicas);
    if (features) features.innerHTML = featuresHtml;
    if (featuresSection) featuresSection.hidden = !featuresHtml;

    const discount = Math.max(0, Number(producto.descuento_porcentaje) || 0);
    const priceMarkup = discount > 0
        ? `<span class="product-price-old">${textoSeguro(formatearPrecio(producto.precio_original))}</span><span class="product-price-current">${textoSeguro(formatearPrecio(producto.precio))}</span><span class="product-discount-badge">-${Math.round(discount)}%</span>`
        : `<span class="product-price-current">${textoSeguro(formatearPrecio(producto.precio))}</span>`;

    const precio = modal.querySelector(".dynamic-product-price");
    if (precio) {
        precio.classList.toggle("has-discount", discount > 0);
        precio.innerHTML = priceMarkup;
    }

    const precioMobile = modal.querySelector(".dynamic-product-price-mobile");
    if (precioMobile) {
        precioMobile.classList.toggle("has-discount", discount > 0);
        precioMobile.innerHTML = priceMarkup;
    }

    const stockElemento = modal.querySelector(".dynamic-product-stock");

if (stockElemento) {
    if (stock <= 0) {
        stockElemento.textContent = "SIN STOCK";
    } else if (stock === 1) {
        stockElemento.textContent = "🔥 ¡Última unidad!";
    } else if (stock <= 3) {
        stockElemento.textContent = `🔥 ¡Últimas ${stock} unidades!`;
    } else {
        stockElemento.textContent = `${stock} disponibles`;
    }
}

    const bloqueCantidad = modal.querySelector(".quantity-block");
    const selector = modal.querySelector(".quantity-selector");
    const input = modal.querySelector(".dynamic-qty-input");
    const boton = modal.querySelector(".dynamic-add-cart");
    const ayuda = modal.querySelector(".dynamic-qty-help");

    if (input) {
        input.value = "1";
        input.disabled = stock <= 0;
    }

    if (bloqueCantidad) {
        bloqueCantidad.style.opacity = stock > 0 ? "1" : ".45";
    }

    if (ayuda) {
        ayuda.textContent =
            stock > 0
                ? `Podés elegir entre 1 y ${stock}.`
                : "Este producto no tiene stock.";
    }

    if (selector && stock > 0) {
        configurarSelectorCantidad(selector, stock);
    }

    if (selector && stock <= 0) {
        selector.querySelectorAll("button").forEach(btn => btn.disabled = true);
    }

    if (boton) {
        boton.disabled = stock <= 0;
        boton.innerHTML = stock > 0
            ? '<svg class="ui-icon" aria-hidden="true"><use href="#i-cart"></use></svg><span>Agregar al carrito</span>'
            : "<span>SIN STOCK</span>";

        boton.onclick = () => {
            if (stock <= 0) return;

            const cantidad = obtenerCantidad(input, stock);
            agregarAlCarrito(producto, cantidad);
            cerrarProductoDinamico();
        };
    }

    const botonMobile = modal.querySelector(".dynamic-add-cart-mobile");
    if (botonMobile) {
        botonMobile.disabled = stock <= 0;
        botonMobile.innerHTML = stock > 0
            ? '<svg class="ui-icon" aria-hidden="true"><use href="#i-cart"></use></svg><span>Agregar</span>'
            : "<span>SIN STOCK</span>";
        botonMobile.onclick = () => boton?.click();
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");

    modal.scrollTop = 0;
    const detailInfo = modal.querySelector(".product-detail-info");
    if (detailInfo) detailInfo.scrollTop = 0;

    requestAnimationFrame(() => {
        modal.querySelector(".product-detail-close")?.focus({ preventScroll: true });
    });
}

function cerrarProductoDinamico() {
    const modal = document.getElementById("producto-dinamico");

    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    productoModalActual = null;
}

function mostrarToastCarrito(
    titulo = "Producto agregado",
    mensaje = "Se agregó al carrito correctamente."
) {
    const toast = document.getElementById("cart-toast");

    if (!toast) return;

    const tituloToast = toast.querySelector("strong");
    const mensajeToast = toast.querySelector("div span");
    const iconoToast = toast.querySelector(".cart-toast-icon");

    if (tituloToast) tituloToast.textContent = titulo;
    if (mensajeToast) mensajeToast.textContent = mensaje;

    const tituloNormalizado = String(titulo || "").toLowerCase();
    let tipoToast = "add";
    let icono = '<svg class="ui-icon" aria-hidden="true"><use href="#i-check"></use></svg>';

    if (tituloNormalizado.includes("eliminado")) {
        tipoToast = "remove";
        icono = '<svg class="ui-icon" aria-hidden="true"><use href="#i-trash"></use></svg>';
    } else if (tituloNormalizado.includes("vacío")) {
        tipoToast = "empty";
        icono = '<svg class="ui-icon" aria-hidden="true"><use href="#i-bag"></use></svg>';
    } else if (tituloNormalizado.includes("stock") || tituloNormalizado.includes("sin stock")) {
        tipoToast = "warning";
        icono = '<svg class="ui-icon" aria-hidden="true"><use href="#i-alert"></use></svg>';
    }

    toast.dataset.type = tipoToast;
    if (iconoToast) iconoToast.innerHTML = icono;

    toast.classList.remove("active");
    void toast.offsetWidth;
    toast.classList.add("active");

    clearTimeout(window.toastCarritoTimeout);

    window.toastCarritoTimeout = setTimeout(() => {
        toast.classList.remove("active");
    }, 2500);
}

function agregarAlCarrito(producto, cantidadSolicitada = 1) {
    const carrito = leerCarrito();
    const stock = Math.max(0, Number(producto.stock) || 0);

    if (stock <= 0) {
        mostrarToastCarrito(
            "Producto sin stock",
            "Este producto no está disponible en este momento."
        );
        return;
    }

    const existente = carrito.find(
        item => String(item.id) === String(producto.id)
    );

    const actual = existente ? Math.max(0, Number(existente.cantidad) || 0) : 0;
    const disponible = Math.max(0, stock - actual);
    const solicitada = Math.max(1, Math.floor(Number(cantidadSolicitada) || 1));

    if (disponible <= 0) {
        mostrarToastCarrito(
            "Stock máximo alcanzado",
            "Ya agregaste todas las unidades disponibles."
        );
        return;
    }

    const agregar = Math.min(solicitada, disponible);

    if (existente) {
        existente.cantidad = actual + agregar;
        existente.nombre = producto.nombre || existente.nombre;
        existente.precio = Number(producto.precio) || 0;
        existente.imagen = imagenSegura(producto.imagen);
        existente.categoria = producto.categoria || existente.categoria || "Producto";
        existente.stock = stock;
    } else {
        carrito.push({
            id: producto.id,
            nombre: producto.nombre || "Producto",
            precio: Number(producto.precio) || 0,
            imagen: imagenSegura(producto.imagen),
            categoria: producto.categoria || "Producto",
            stock,
            cantidad: agregar
        });
    }

    guardarCarrito(carrito);

    if (agregar < solicitada) {
        mostrarToastCarrito(
            "Stock limitado",
            `Se agregaron ${agregar} de ${solicitada} unidades solicitadas.`
        );
    } else {
        mostrarToastCarrito(
            agregar === 1 ? "Producto agregado" : "Productos agregados",
            agregar === 1
                ? `${producto.nombre} se agregó al carrito.`
                : `Se agregaron ${agregar} unidades de ${producto.nombre}.`
        );
    }
}

function cambiarCantidadCarrito(id, nuevaCantidad) {
    const carrito = leerCarrito();
    const item = carrito.find(
        producto => String(producto.id) === String(id)
    );

    if (!item) return;

    const stock = Math.max(1, Number(item.stock) || 1);
    const cantidad = Math.min(
        stock,
        Math.max(1, Math.floor(Number(nuevaCantidad) || 1))
    );

    item.cantidad = cantidad;
    guardarCarrito(carrito);
}

function eliminarDelCarrito(id) {
    const carrito = leerCarrito().filter(
        item => String(item.id) !== String(id)
    );

    guardarCarrito(carrito);

    mostrarToastCarrito(
        "Producto eliminado",
        "Se quitó el producto del carrito."
    );
}

function vaciarCarrito() {
    const carrito = leerCarrito();

    if (carrito.length === 0) return;

    localStorage.removeItem(DORADO_CART_KEY);
    renderCarrito();

    mostrarToastCarrito(
        "Carrito vacío",
        "Se eliminaron todos los productos del carrito."
    );
}

function renderCarrito() {
    const carrito = leerCarrito();
    const contenedor = document.getElementById("cart-items");
    const contador = document.getElementById("cart-count");
    const contadorMobile = document.getElementById("mobile-cart-count");
    const contadorCabecera = document.getElementById("cart-head-count");
    const unidadesTexto = document.getElementById("cart-units");
    const totalTexto = document.getElementById("cart-total");
    const footer = document.getElementById("cart-footer");
    const checkout = document.getElementById("cart-checkout");

    const unidades = cantidadTotal(carrito);
    const total = carrito.reduce(
        (suma, item) =>
            suma +
            (Number(item.precio) || 0) *
            Math.max(0, Number(item.cantidad) || 0),
        0
    );

    if (contador) {
        contador.textContent = unidades > 99 ? "99+" : String(unidades);
        contador.setAttribute(
            "aria-label",
            `${unidades} ${unidades === 1 ? "producto" : "productos"} en el carrito`
        );
    }

    if (contadorMobile) {
        contadorMobile.textContent = unidades > 99 ? "99+" : String(unidades);
        contadorMobile.style.display = unidades > 0 ? "grid" : "none";
    }

    if (contadorCabecera) {
        contadorCabecera.textContent =
            `${unidades} ${unidades === 1 ? "producto" : "productos"}`;
    }

    if (unidadesTexto) {
        unidadesTexto.textContent =
            `${unidades} ${unidades === 1 ? "unidad" : "unidades"}`;
    }

    if (totalTexto) totalTexto.textContent = formatearPrecio(total);

    if (checkout) checkout.disabled = carrito.length === 0;
    if (footer) footer.style.display = carrito.length === 0 ? "none" : "block";

    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (carrito.length === 0) {
        contenedor.innerHTML = `
            <div class="cart-empty">
                <div class="cart-empty-inner">
                    <div class="cart-empty-icon" aria-hidden="true"><svg class="ui-icon" aria-hidden="true"><use href="#i-bag"></use></svg></div>
                    <h3>Tu carrito está vacío</h3>
                    <p>
                        Elegí tus productos, seleccioná la cantidad y agregalos al carrito.
                    </p>
                    <button
                        type="button"
                        class="gold-btn cart-empty-products"
                    >
                        VER PRODUCTOS
                    </button>
                </div>
            </div>
        `;

        contenedor.querySelector(".cart-empty-products")?.addEventListener("click", () => {
            cerrarCarrito();
            document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" });
        });

        return;
    }

    carrito.forEach(item => {
        const stock = Math.max(1, Number(item.stock) || 1);
        const cantidad = Math.min(
            stock,
            Math.max(1, Number(item.cantidad) || 1)
        );
        const precio = Number(item.precio) || 0;

        const elemento = document.createElement("article");
        elemento.className = "cart-item";

        elemento.innerHTML = `
            <img
                class="cart-item-image"
                src="${textoSeguro(imagenSegura(item.imagen))}"
                alt="${textoSeguro(item.nombre || "Producto")}"
            >

            <div class="cart-item-content">
                <div class="cart-item-top">
                    <div>
                        <div class="cart-item-name">
                            ${textoSeguro(item.nombre || "Producto")}
                        </div>
                        <div class="cart-item-category">
                            ${textoSeguro(item.categoria || "Producto")}
                        </div>
                    </div>

                    <button
                        type="button"
                        class="cart-remove"
                        aria-label="Eliminar ${textoSeguro(item.nombre || "producto")} del carrito"
                    >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>
                        </svg>
                    </button>
                </div>

                <div class="cart-item-bottom">
                    <div class="quantity-selector cart-item-quantity">
                        <button
                            type="button"
                            class="qty-btn"
                            data-qty-action="minus"
                            aria-label="Restar una unidad"
                        ><svg class="ui-icon" aria-hidden="true"><use href="#i-minus"></use></svg></button>

                        <input
                            class="qty-input"
                            type="number"
                            min="1"
                            max="${stock}"
                            value="${cantidad}"
                            inputmode="numeric"
                            aria-label="Cantidad de ${textoSeguro(item.nombre || "producto")}"
                        >

                        <button
                            type="button"
                            class="qty-btn"
                            data-qty-action="plus"
                            aria-label="Sumar una unidad"
                        ><svg class="ui-icon" aria-hidden="true"><use href="#i-plus"></use></svg></button>
                    </div>

                    <div class="cart-item-prices">
                        <div class="cart-item-unit">
                            ${textoSeguro(formatearPrecio(precio))} c/u
                        </div>
                        <div class="cart-item-subtotal">
                            ${textoSeguro(formatearPrecio(precio * cantidad))}
                        </div>
                    </div>
                </div>
            </div>
        `;

        const selector = elemento.querySelector(".cart-item-quantity");
        const input = selector?.querySelector(".qty-input");

        if (selector && input) {
            configurarSelectorCantidad(
                selector,
                stock,
                nuevaCantidad => cambiarCantidadCarrito(item.id, nuevaCantidad)
            );
        }

        elemento.querySelector(".cart-remove")?.addEventListener(
            "click",
            () => eliminarDelCarrito(item.id)
        );

        contenedor.appendChild(elemento);
    });
}

function abrirCarrito() {
    const drawer = document.getElementById("cart-drawer");
    const overlay = document.getElementById("cart-overlay");
    const trigger = document.getElementById("cart-trigger");

    if (!drawer || !overlay) return;

    renderCarrito();

    drawer.classList.remove("is-dragging");
    drawer.style.removeProperty("--drawer-drag-x");
    overlay.style.removeProperty("opacity");
    overlay.classList.add("active");
    drawer.classList.add("active");

    overlay.setAttribute("aria-hidden", "false");
    drawer.setAttribute("aria-hidden", "false");
    trigger?.setAttribute("aria-expanded", "true");

    document.body.classList.add("cart-open");

    requestAnimationFrame(() => {
        drawer.querySelector(".cart-close")?.focus({ preventScroll: true });
    });
}

function cerrarCarrito() {
    const drawer = document.getElementById("cart-drawer");
    const overlay = document.getElementById("cart-overlay");
    const trigger = document.getElementById("cart-trigger");

    if (!drawer || !overlay) return;

    overlay.classList.remove("active");
    drawer.classList.remove("active");

    overlay.setAttribute("aria-hidden", "true");
    drawer.setAttribute("aria-hidden", "true");
    trigger?.setAttribute("aria-expanded", "false");

    document.body.classList.remove("cart-open");
}

function consultarCompraMayorista() {
    const carrito = leerCarrito();

    if (carrito.length === 0) {
        mostrarToastCarrito(
            "Carrito vacío",
            "Agregá productos para consultar una compra mayorista."
        );
        return;
    }

    const unidades = cantidadTotal(carrito);
    const totalActual = carrito.reduce(
        (suma, item) =>
            suma +
            (Number(item.precio) || 0) *
            Math.max(0, Number(item.cantidad) || 0),
        0
    );

    const detalle = carrito
        .map((item, indice) => {
            const cantidad = Math.max(1, Number(item.cantidad) || 1);
            return `${indice + 1}. ${item.nombre} · ${cantidad} u.`;
        })
        .join("\n");

    const mensaje = [
        "Hola Dorado Artículos de Pesca 👋",
        "",
        "Quiero consultar por una compra mayorista con estos productos:",
        "",
        detalle,
        "",
        `Unidades totales: ${unidades}`,
        `Total actual del carrito: ${formatearPrecio(totalActual)}`,
        "",
        "¿Me pueden indicar precio mayorista, disponibilidad y forma de entrega?"
    ].join("\n");

    const url = `https://wa.me/${DORADO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, "_blank", "noopener,noreferrer");
}


function renderCheckoutResumen() {
    const carrito = leerCarrito();
    const lista = document.getElementById("checkout-summary-list");
    const totalEl = document.getElementById("checkout-summary-total");
    const unidadesEl = document.getElementById("checkout-summary-units");

    if (!lista) return;

    lista.innerHTML = "";

    let total = 0;
    let unidades = 0;

    carrito.forEach(item => {
        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        const precio = Number(item.precio) || 0;
        const subtotal = precio * cantidad;
        total += subtotal;
        unidades += cantidad;

        const fila = document.createElement("div");
        fila.className = "checkout-summary-item";
        fila.innerHTML = `
            <img src="${textoSeguro(imagenSegura(item.imagen))}" alt="${textoSeguro(item.nombre || "Producto")}">
            <div>
                <strong>${textoSeguro(item.nombre || "Producto")}</strong>
                <small>${cantidad} × ${textoSeguro(formatearPrecio(precio))}</small>
            </div>
            <div class="checkout-summary-price">${textoSeguro(formatearPrecio(subtotal))}</div>
        `;
        lista.appendChild(fila);
    });

    const roundedSubtotal = Math.round(total * 100) / 100;
    if (checkoutCoupon && Math.abs(Number(checkoutCoupon.subtotal || 0) - roundedSubtotal) > 0.01) {
        checkoutCoupon = null;
        const msg = document.getElementById("checkout-coupon-message");
        if (msg) {
            msg.textContent = "El carrito cambió. Volvé a aplicar el cupón.";
            msg.className = "checkout-coupon-message error";
        }
    }

    const discountRow = document.getElementById("checkout-summary-discount-row");
    const discountEl = document.getElementById("checkout-summary-discount");
    const couponCodeEl = document.getElementById("checkout-summary-coupon-code");
    const discount = checkoutCoupon ? Math.max(0, Number(checkoutCoupon.discount) || 0) : 0;
    const finalTotal = checkoutCoupon ? Math.max(0, Number(checkoutCoupon.total) || roundedSubtotal) : roundedSubtotal;

    if (discountRow) discountRow.hidden = discount <= 0;
    if (discountEl) discountEl.textContent = `-${formatearPrecio(discount)}`;
    if (couponCodeEl) couponCodeEl.textContent = checkoutCoupon?.code ? `· ${checkoutCoupon.code}` : "";
    if (totalEl) totalEl.textContent = formatearPrecio(finalTotal);
    if (unidadesEl) {
        unidadesEl.textContent = `${unidades} ${unidades === 1 ? "unidad" : "unidades"}`;
    }
}

async function aplicarCuponCheckout() {
    const input = document.getElementById("checkout-coupon-code");
    const message = document.getElementById("checkout-coupon-message");
    const button = document.getElementById("checkout-coupon-apply");
    const code = String(input?.value || "").trim().toUpperCase();

    if (!code) {
        checkoutCoupon = null;
        if (message) {
            message.textContent = "Ingresá un código de cupón.";
            message.className = "checkout-coupon-message error";
        }
        renderCheckoutResumen();
        return;
    }

    const carrito = leerCarrito();
    const items = carrito.map(item => ({
        id: item.id,
        cantidad: Math.max(1, Math.floor(Number(item.cantidad) || 1))
    }));

    if (button) { button.disabled = true; button.textContent = "VALIDANDO…"; }
    if (message) { message.textContent = "Validando cupón…"; message.className = "checkout-coupon-message"; }

    try {
        const response = await fetch("/api/coupon", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ code, items })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "No pudimos validar el cupón.");

        checkoutCoupon = data;
        if (input) input.value = String(data.code || code);
        if (message) {
            message.textContent = `${data.message || "Cupón aplicado."} Ahorrás ${formatearPrecio(data.discount)}.`;
            message.className = "checkout-coupon-message ok";
        }
        renderCheckoutResumen();
    } catch (error) {
        checkoutCoupon = null;
        if (message) {
            message.textContent = error?.message || "El cupón no es válido.";
            message.className = "checkout-coupon-message error";
        }
        renderCheckoutResumen();
    } finally {
        if (button) { button.disabled = false; button.textContent = "APLICAR"; }
    }
}

function abrirCheckout() {
    const carrito = leerCarrito();

    if (carrito.length === 0) {
        mostrarToastCarrito("Carrito vacío", "Agregá al menos un producto antes de continuar.");
        return;
    }

    cerrarCarrito();

    const modal = document.getElementById("checkout-modal");
    if (!modal) return;

    renderCheckoutResumen();
    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("checkout-open");

    requestAnimationFrame(() => {
        document.getElementById("checkout-name")?.focus({ preventScroll: true });
    });
}

function cerrarCheckout() {
    const modal = document.getElementById("checkout-modal");
    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("checkout-open");
}

function mostrarErrorCheckout(mensaje = "") {
    const caja = document.getElementById("checkout-error");
    if (!caja) return;

    caja.textContent = mensaje;
    caja.classList.toggle("active", Boolean(mensaje));
}

function confirmarRedireccionPago(metodo){
    const overlay=document.getElementById("payment-confirm-overlay");
    const title=document.getElementById("payment-confirm-title");
    const text=document.getElementById("payment-confirm-text");
    const accept=document.getElementById("payment-confirm-accept");
    const cancel=document.getElementById("payment-confirm-cancel");
    if(!overlay||!title||!text||!accept||!cancel)return Promise.resolve(true);

    const provider="Mercado Pago";
    title.textContent=`Vas a continuar a ${provider}`;
    text.textContent=`Te vamos a redirigir a ${provider} para confirmar tu compra de forma segura. Si preferís otro medio de pago, podés volver y cambiarlo.`;
    overlay.hidden=false;
    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden","false");
    document.body.classList.add("payment-confirm-open");
    window.setTimeout(()=>accept.focus(),0);

    return new Promise(resolve=>{
        const close=value=>{
            overlay.hidden=true;
            overlay.classList.remove("active");
            overlay.setAttribute("aria-hidden","true");
            document.body.classList.remove("payment-confirm-open");
            accept.removeEventListener("click",onAccept);
            cancel.removeEventListener("click",onCancel);
            overlay.removeEventListener("click",onOverlay);
            document.removeEventListener("keydown",onKey);
            resolve(value);
        };
        const onAccept=()=>close(true);
        const onCancel=()=>close(false);
        const onOverlay=event=>{if(event.target===overlay)close(false);};
        const onKey=event=>{if(event.key==="Escape")close(false);};
        accept.addEventListener("click",onAccept);
        cancel.addEventListener("click",onCancel);
        overlay.addEventListener("click",onOverlay);
        document.addEventListener("keydown",onKey);
    });
}

async function iniciarPagoMercadoPago(evento) {
    evento?.preventDefault();
    const form=document.getElementById("checkout-form");
    const boton=document.getElementById("checkout-pay");
    if(!form||!boton)return;

    mostrarErrorCheckout("");
    if(!form.reportValidity())return;

    const carrito=leerCarrito();
    if(!carrito.length){mostrarErrorCheckout("Tu carrito está vacío.");return;}

    const datos=new FormData(form);
    const metodoPago=String(datos.get("metodo_pago")||"").trim();
    const entrega=String(datos.get("entrega")||"retiro").trim();
    if(!metodoPago){mostrarErrorCheckout("Elegí un medio de pago para continuar.");return;}

    if(metodoPago==="efectivo" && entrega!=="retiro"){
        mostrarErrorCheckout("El pago en efectivo está disponible únicamente para retiro en el local.");
        return;
    }

    const cliente={
        nombre:String(datos.get("nombre")||"").trim(),
        email:String(datos.get("email")||"").trim(),
        telefono:String(datos.get("telefono")||"").trim(),
        domicilio:String(datos.get("domicilio")||"").trim(),
        ciudad:String(datos.get("ciudad")||"").trim(),
        provincia:String(datos.get("provincia")||"").trim(),
        codigo_postal:String(datos.get("codigo_postal")||"").trim(),
        entrega,
        notas:String(datos.get("notas")||"").trim()
    };
    if(["whatsapp","transferencia","efectivo"].includes(metodoPago)){
        const subtotal=carrito.reduce((sum,item)=>sum+(Number(item.precio)||0)*Math.max(1,Number(item.cantidad)||1),0);
        const total=checkoutCoupon && Math.abs(Number(checkoutCoupon.subtotal||0)-subtotal)<0.01
            ? Number(checkoutCoupon.total)||subtotal
            : subtotal;
        const detalle=carrito.map((item,i)=>{
            const cantidad=Math.max(1,Number(item.cantidad)||1);
            return `${i+1}. ${item.nombre} · ${cantidad} u. · ${formatearPrecio((Number(item.precio)||0)*cantidad)}`;
        }).join("\n");
        const pagos={
            whatsapp:"A coordinar por WhatsApp",
            transferencia:"Transferencia bancaria",
            efectivo:"Efectivo al retirar"
        };
        const entregas={
            retiro:"Retiro en el local",
            local:"Envío local",
            nacional:"Envío al resto de Argentina",
            coordinar:"A coordinar"
        };
        const mensaje=[
            "Hola Dorado Artículos de Pesca 👋",
            "Quiero confirmar este pedido desde la web:","",detalle,"",
            checkoutCoupon?`Cupón: ${checkoutCoupon.code} · Descuento: -${formatearPrecio(checkoutCoupon.discount)}`:"",
            `TOTAL PRODUCTOS: ${formatearPrecio(total)}`,
            `Pago: ${pagos[metodoPago]||"A coordinar"}`,
            `Entrega: ${entregas[entrega]||entrega}`,
            "",`Nombre: ${cliente.nombre}`,`Teléfono: ${cliente.telefono}`,
            cliente.domicilio?`Domicilio: ${cliente.domicilio}`:"",
            cliente.ciudad?`Localidad: ${cliente.ciudad}`:"",
            cliente.notas?`Aclaraciones: ${cliente.notas}`:"",
            "","¿Me confirman disponibilidad y cómo seguimos?"
        ].filter(Boolean).join("\n");
        window.open(`https://wa.me/${DORADO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`,"_blank","noopener,noreferrer");
        return;
    }

    if(metodoPago==="tarjeta"){
        if(!window.__doradoCardFormReady){
            mostrarErrorCheckout("Estamos preparando los campos seguros de Mercado Pago. Esperá un instante y volvé a intentar.");
            window.__doradoInitCardPayment?.();
        }
        // Mercado Pago CardForm escucha este mismo submit y procesa la tarjeta.
        // No enviamos PAN/CVV al backend de Dorado.
        return;
    }

    if(metodoPago==="mercadopago"){
        const confirmed=await confirmarRedireccionPago(metodoPago);
        if(!confirmed)return;
    }

    const availability=window.doradoPaymentAvailability||{};
    if(metodoPago==="mercadopago" && availability.mercadoPago===false){
        mostrarErrorCheckout("Mercado Pago todavía no está habilitado para cobrar. Podés elegir transferencia, efectivo o WhatsApp.");
        return;
    }
    if(metodoPago==="tarjeta" && availability.card===false){
        mostrarErrorCheckout("El cobro directo con tarjeta todavía no está habilitado. Falta configurar la Public Key de Mercado Pago.");
        return;
    }

    const items=carrito.map(item=>({id:item.id,cantidad:Math.max(1,Math.floor(Number(item.cantidad)||1))}));

    boton.disabled=true;
    const htmlOriginal=boton.innerHTML;
    boton.innerHTML='<span>Preparando pago seguro…</span>';

    try{
        const respuesta=await fetch("/api/checkout",{
            method:"POST",
            headers:{"Content-Type":"application/json","Accept":"application/json"},
            body:JSON.stringify({
                cliente,
                items,
                payment_method:metodoPago,
                cupon:String(document.getElementById("checkout-coupon-code")?.value||"").trim().toUpperCase()
            })
        });
        const data=await respuesta.json().catch(()=>({}));
        if(!respuesta.ok)throw new Error(data?.error||"No pudimos iniciar el pago.");
        if(!data?.init_point)throw new Error("El procesador no devolvió un enlace de pago seguro.");

        const orderId=String(data.order_id||"");
        const trackingToken=String(data.tracking_token||"");
        if(orderId&&trackingToken)guardarReferenciaPedido(orderId,trackingToken);
        sessionStorage.setItem("doradoUltimoPedido",orderId);
        window.location.assign(data.init_point);
    }catch(error){
        console.error("Error iniciando pago:",error);
        mostrarErrorCheckout(error?.message||"No pudimos iniciar el pago. Probá nuevamente.");
        boton.disabled=false;
        boton.innerHTML=htmlOriginal;
    }
}

function leerReferenciasPedidos() {
    try {
        const value = JSON.parse(localStorage.getItem(DORADO_ORDERS_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        return value
            .filter(x => x && typeof x.id === "string" && typeof x.tracking === "string")
            .slice(0, 20);
    } catch {
        return [];
    }
}

function guardarReferenciaPedido(id, tracking) {
    id = String(id || "").trim();
    tracking = String(tracking || "").trim();
    if (!id || !tracking) return;

    const pedidos = leerReferenciasPedidos().filter(p => p.id !== id);
    pedidos.unshift({ id, tracking, saved_at: Date.now() });
    localStorage.setItem(DORADO_ORDERS_KEY, JSON.stringify(pedidos.slice(0, 20)));
}

function formatoPedido(id) {
    const raw = String(id || "").replaceAll("-", "").toUpperCase();
    return raw ? `DP-${raw.slice(0, 10)}` : "DP-—";
}

function enlaceSeguimientoPedido(id, tracking) {
    const orderId = String(id || "").trim();
    const token = String(tracking || "").trim();
    if (!orderId || !token) return "";
    return `/pedido.html?id=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(token)}`;
}

function escPedido(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function estadoPreparacionInfo(value, paymentStatus) {
    const prep = String(value || "nuevo").toLowerCase();
    const payment = String(paymentStatus || "").toLowerCase();

    if (prep === "cancelado") return { label: "Cancelado", step: -1, cancelled: true, review: false };
    if (payment === "revision") return { label: "Pago en revisión", step: 1, cancelled: false, review: true };
    if (payment === "reembolsado") return { label: "Reembolsado", step: -1, cancelled: true, review: false };
    if (payment === "fallido") return { label: "Pago no completado", step: 0, cancelled: false, review: false };
    if (payment !== "pagado") return { label: "Esperando pago", step: 0, cancelled: false, review: false };
    if (prep === "entregado") return { label: "Entregado", step: 4, cancelled: false, review: false };
    if (prep === "enviado") return { label: "Enviado", step: 3, cancelled: false, review: false };
    if (prep === "preparando") return { label: "Preparando", step: 2, cancelled: false, review: false };
    return { label: "Pago confirmado", step: 1, cancelled: false, review: false };
}

function renderPedidoCliente(data) {
    const info = estadoPreparacionInfo(data.preparation_status, data.status);
    const fecha = data.created_at
        ? new Date(data.created_at).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })
        : "";
    const total = new Intl.NumberFormat("es-AR", {
        style: "currency", currency: "ARS", maximumFractionDigits: 0
    }).format(Number(data.total) || 0);

    const steps = [
        ["i-check", "Pedido"],
        ["i-card", "Pagado"],
        ["i-package", "Preparando"],
        ["i-truck", "Enviado"],
        ["i-home", "Entregado"]
    ];

    const progress = steps.map((step, index) => {
        let cls = "";
        if (!info.cancelled) {
            if (index < info.step) cls = "done";
            else if (index === info.step) cls = "active";
        }
        return `<div class="order-track-step ${cls}">
            <span class="order-track-dot"><svg class="ui-icon"><use href="#${step[0]}"></use></svg></span>
            <small>${step[1]}</small>
        </div>`;
    }).join("");

    const items = (Array.isArray(data.items) ? data.items : []).map(item => {
        const qty = Math.max(1, Number(item.quantity) || 1);
        const unit = Number(item.unit_price) || 0;
        const subtotal = new Intl.NumberFormat("es-AR", {
            style: "currency", currency: "ARS", maximumFractionDigits: 0
        }).format(unit * qty);
        return `<div class="customer-order-item">
            <span><strong>${escPedido(item.name)}</strong><small>${qty} × unidad</small></span>
            <strong>${subtotal}</strong>
        </div>`;
    }).join("");

    return `<article class="customer-order-card ${info.cancelled ? "is-cancelled" : ""}">
        <div class="customer-order-top">
            <div>
                <span class="customer-order-number">${formatoPedido(data.id)}</span>
                <small>${escPedido(fecha)}</small>
            </div>
            <span class="customer-order-status">${escPedido(info.label)}</span>
        </div>
        ${info.cancelled
            ? '<div class="customer-order-cancelled"><svg class="ui-icon"><use href="#i-alert"></use></svg>Este pedido no continúa en preparación.</div>'
            : `<div class="order-track">${progress}</div>`}
        ${info.review ? '<div class="customer-order-review"><svg class="ui-icon"><use href="#i-alert"></use></svg><span><strong>Pago registrado.</strong> Estamos revisando el pedido. No vuelvas a pagar.</span></div>' : ""}
        <div class="customer-order-items">${items || '<div class="orders-loading">Sin detalle de productos.</div>'}</div>
        <div class="customer-order-total"><span>Total</span><strong>${total}</strong></div>
        ${data._tracking ? `<a class="customer-order-link" href="${enlaceSeguimientoPedido(data.id, data._tracking)}">VER SEGUIMIENTO COMPLETO <svg class="ui-icon"><use href="#i-arrow"></use></svg></a>` : ""}
    </article>`;
}

async function cargarMisPedidos(force = false) {
    const list = document.getElementById("orders-list");
    const count = document.getElementById("orders-count");
    const refresh = document.getElementById("orders-refresh");
    if (!list) return;

    const refs = leerReferenciasPedidos();
    if (count) count.textContent = `${refs.length} ${refs.length === 1 ? "pedido" : "pedidos"}`;

    if (!refs.length) {
        list.innerHTML = `<div class="orders-empty">
            <svg class="ui-icon"><use href="#i-package"></use></svg>
            <strong>Todavía no hay pedidos guardados</strong>
            <span>Cuando realices una compra, vas a poder seguirla desde acá.</span>
        </div>`;
        return;
    }

    if (refresh) refresh.disabled = true;
    list.innerHTML = '<div class="orders-loading"><span></span>Actualizando tus pedidos…</div>';

    const results = await Promise.all(refs.map(async ref => {
        try {
            const r = await fetch(`/api/order-status?id=${encodeURIComponent(ref.id)}&tracking=${encodeURIComponent(ref.tracking)}`, {
                headers: { Accept: "application/json" },
                cache: "no-store"
            });
            const data = await r.json().catch(() => ({}));

            if (r.status === 404) {
                return { missing: true, id: ref.id };
            }

            if (r.ok) {
                data._tracking = ref.tracking;
                return { data };
            }
            return { error: true };
        } catch {
            return { error: true };
        }
    }));

    const missingIds = new Set(
        results.filter(result => result?.missing).map(result => result.id)
    );

    if (missingIds.size) {
        const cleaned = refs.filter(ref => !missingIds.has(ref.id));
        localStorage.setItem(DORADO_ORDERS_KEY, JSON.stringify(cleaned));
    }

    const refsActuales = leerReferenciasPedidos();
    if (count) {
        count.textContent = `${refsActuales.length} ${refsActuales.length === 1 ? "pedido" : "pedidos"}`;
    }

    const valid = results
        .filter(result => result?.data)
        .map(result => result.data);

    if (!refsActuales.length) {
        list.innerHTML = `<div class="orders-empty">
            <svg class="ui-icon"><use href="#i-package"></use></svg>
            <strong>Todavía no hay pedidos guardados</strong>
            <span>Cuando realices una compra, vas a poder seguirla desde acá.</span>
        </div>`;
    } else {
        list.innerHTML = valid.length
            ? valid.map(renderPedidoCliente).join("")
            : `<div class="orders-empty">
                <svg class="ui-icon"><use href="#i-alert"></use></svg>
                <strong>No pudimos cargar tus pedidos</strong>
                <span>Revisá tu conexión e intentá actualizar nuevamente.</span>
            </div>`;
    }

    if (refresh) refresh.disabled = false;
}

function abrirMisPedidos() {
    cerrarCarrito();
    const drawer = document.getElementById("orders-drawer");
    const overlay = document.getElementById("orders-overlay");
    if (!drawer || !overlay) return;

    drawer.classList.remove("is-dragging");
    drawer.style.removeProperty("--drawer-drag-x");
    overlay.style.removeProperty("opacity");
    drawer.classList.add("active");
    overlay.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
    document.getElementById("orders-trigger")?.setAttribute("aria-expanded", "true");
    document.body.classList.add("orders-open");
    cargarMisPedidos();
}

function cerrarMisPedidos() {
    const drawer = document.getElementById("orders-drawer");
    const overlay = document.getElementById("orders-overlay");
    drawer?.classList.remove("active");
    overlay?.classList.remove("active");
    drawer?.setAttribute("aria-hidden", "true");
    overlay?.setAttribute("aria-hidden", "true");
    document.getElementById("orders-trigger")?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("orders-open");
}


function cerrarResultadoPago() {
    const modal = document.getElementById("payment-result");
    if (!modal) return;

    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("payment-result-open");

    if (/\/gracias\.html$/i.test(window.location.pathname)) {
        history.replaceState({}, document.title, "/");
    }
}

function mostrarResultadoPago({
    estado = "success",
    titulo = "¡Compra confirmada!",
    mensaje = "Recibimos tu pago correctamente.",
    pedido = "",
    tracking = "",
    ayuda = "Guardá este número. Nos comunicaremos para coordinar la entrega."
} = {}) {
    const modal = document.getElementById("payment-result");
    if (!modal) return false;

    const icono = document.getElementById("payment-result-icon");
    const tituloEl = document.getElementById("payment-result-title");
    const mensajeEl = document.getElementById("payment-result-message");
    const pedidoEl = document.getElementById("payment-result-order-id");
    const ayudaEl = document.getElementById("payment-result-help");
    const botonCerrar = document.getElementById("payment-result-close");
    const seguimientoEl = document.getElementById("payment-result-tracking");
    const whatsappEl = modal.querySelector(".payment-result-whatsapp");

    modal.dataset.status = estado;

    if (tituloEl) tituloEl.textContent = titulo;
    if (mensajeEl) mensajeEl.textContent = mensaje;
    if (pedidoEl) pedidoEl.textContent = pedido ? formatoPedido(pedido) : "—";
    if (seguimientoEl) {
        const href = enlaceSeguimientoPedido(pedido, tracking);
        seguimientoEl.hidden = !href;
        if (href) seguimientoEl.href = href;
    }
    if (whatsappEl && pedido) {
        whatsappEl.href = `https://wa.me/${DORADO_WHATSAPP}?text=${encodeURIComponent(`Hola Dorado Artículos de Pesca, quiero consultar por mi pedido ${formatoPedido(pedido)}.`)}`;
    }
    if (ayudaEl) ayudaEl.textContent = ayuda;

    if (icono) {
        const iconoId = estado === "failure" ? "i-alert" : estado === "pending" ? "i-alert" : "i-check";
        icono.innerHTML = `<svg class="ui-icon" aria-hidden="true"><use href="#${iconoId}"></use></svg>`;
    }

    if (botonCerrar) {
        botonCerrar.textContent = estado === "failure"
            ? "VOLVER A INTENTAR"
            : "CONTINUAR EN LA TIENDA";
        botonCerrar.onclick = () => {
            cerrarResultadoPago();
            if (estado === "failure") abrirCheckout();
        };
    }

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("payment-result-open");

    return true;
}

async function comprobarRetornoPago() {
    const params = new URLSearchParams(window.location.search);
    const esPaginaGracias = /\/gracias\.html$/i.test(window.location.pathname);
    const estadoRetorno = params.get("checkout") || (esPaginaGracias ? "success" : "");
    const orderId = params.get("order");
    const trackingToken = params.get("tracking");

    if (!estadoRetorno || !orderId) return;
    if (trackingToken) guardarReferenciaPedido(orderId, trackingToken);

    try {
        const respuesta = await fetch(`/api/order-status?id=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(trackingToken || "")}`, {
            headers: { "Accept": "application/json" },
            cache: "no-store"
        });

        const data = await respuesta.json().catch(() => ({}));
        const estadoReal = String(data?.status || "").toLowerCase();

        if (respuesta.ok && estadoReal === "pagado") {
            localStorage.removeItem(DORADO_CART_KEY);
            sessionStorage.removeItem("doradoUltimoPedido");
            renderCarrito();

            if (!mostrarResultadoPago({
                estado: "success",
                titulo: "¡Gracias por tu compra!",
                mensaje: "Tu pago fue aprobado y tu pedido quedó confirmado correctamente.",
                pedido: orderId,
                tracking: trackingToken,
                ayuda: "Guardá este número de pedido. Nos comunicaremos para coordinar la entrega."
            })) {
                mostrarToastCarrito(
                    "¡Compra confirmada!",
                    "Pago aprobado. Tu pedido quedó confirmado."
                );
            }

        } else if (estadoReal === "revision") {
            localStorage.removeItem(DORADO_CART_KEY);
            sessionStorage.removeItem("doradoUltimoPedido");
            renderCarrito();

            if (!mostrarResultadoPago({
                estado: "pending",
                titulo: "Pago recibido · pedido en revisión",
                mensaje: "Mercado Pago registró el pago y estamos revisando un detalle del pedido.",
                pedido: orderId,
                tracking: trackingToken,
                ayuda: "No vuelvas a pagar. Podés seguir el estado desde el enlace de seguimiento o escribirnos por WhatsApp."
            })) {
                mostrarToastCarrito(
                    "Pedido en revisión",
                    "El pago está registrado. No vuelvas a pagar este pedido."
                );
            }

        } else if (estadoReal === "fallido" || estadoRetorno === "failure") {
            if (!mostrarResultadoPago({
                estado: "failure",
                titulo: "Pago no completado",
                mensaje: "El pago fue rechazado, cancelado o no llegó a completarse.",
                pedido: orderId,
                tracking: trackingToken,
                ayuda: "Tu carrito sigue guardado. Podés volver a intentarlo sin tener que elegir los productos otra vez."
            })) {
                mostrarToastCarrito(
                    "Pago no completado",
                    "Tu carrito sigue guardado para que puedas intentar nuevamente."
                );
            }

        } else if (estadoReal === "pendiente" || estadoRetorno === "pending") {
            if (!mostrarResultadoPago({
                estado: "pending",
                titulo: "Pago pendiente",
                mensaje: "Mercado Pago todavía está procesando tu pago.",
                pedido: orderId,
                tracking: trackingToken,
                ayuda: "No vuelvas a pagar este pedido. Cuando Mercado Pago lo apruebe, registraremos la confirmación automáticamente."
            })) {
                mostrarToastCarrito(
                    "Pago pendiente",
                    "Mercado Pago todavía está procesando el pago."
                );
            }

        } else {
            if (!mostrarResultadoPago({
                estado: "pending",
                titulo: "Verificando tu compra",
                mensaje: "Todavía no pudimos confirmar el estado final del pago.",
                pedido: orderId,
                tracking: trackingToken,
                ayuda: "Si ya pagaste, no vuelvas a realizar el pago. La confirmación puede demorar unos instantes."
            })) {
                mostrarToastCarrito(
                    "Estado del pago",
                    "Estamos verificando tu compra. La confirmación puede demorar unos instantes."
                );
            }
        }

    } catch (error) {
        console.error("Error verificando pedido:", error);

        mostrarResultadoPago({
            estado: "pending",
            titulo: "Verificando tu compra",
            mensaje: "No pudimos consultar el estado del pago en este momento.",
            pedido: orderId,
            tracking: trackingToken,
            ayuda: "Si ya pagaste, no vuelvas a realizar el pago. Podés contactarnos por WhatsApp si necesitás ayuda."
        });
    }

    history.replaceState({}, document.title, window.location.pathname + window.location.hash);
}


document.addEventListener("keydown", evento => {
    if (evento.key === "Escape") {
        if (document.getElementById("orders-drawer")?.classList.contains("active")) {
            cerrarMisPedidos();
            return;
        }

        if (document.getElementById("payment-result")?.classList.contains("active")) {
            cerrarResultadoPago();
            return;
        }

        if (document.getElementById("checkout-modal")?.classList.contains("active")) {
            cerrarCheckout();
            return;
        }

        if (document.getElementById("cart-drawer")?.classList.contains("active")) {
            cerrarCarrito();
            return;
        }

        if (document.getElementById("producto-dinamico")?.classList.contains("active")) {
            cerrarProductoDinamico();
        }
    }
});

document.getElementById("producto-dinamico")?.addEventListener(
    "click",
    evento => {
        if (evento.target.id === "producto-dinamico") {
            cerrarProductoDinamico();
        }
    }
);

window.addEventListener("storage", evento => {
    if (evento.key === DORADO_CART_KEY) {
        renderCarrito();
    }
});

document.getElementById("checkout-form")?.addEventListener("submit", iniciarPagoMercadoPago);

document.getElementById("checkout-modal")?.addEventListener("click", evento => {
    if (evento.target.id === "checkout-modal") {
        cerrarCheckout();
    }
});

document.getElementById("payment-result")?.addEventListener("click", evento => {
    if (evento.target.id === "payment-result") {
        cerrarResultadoPago();
    }
});


// Visual UX enhancements — no external library.
let categoriaActiva = "todos";

function normalizarClaveCategoria(value){
    const text=String(value||"").trim();
    if(!text)return "sin-categoria";
    return text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toLocaleLowerCase("es")
        .replace(/[^a-z0-9]+/g,"-")
        .replace(/^-+|-+$/g,"") || "sin-categoria";
}

function etiquetaCategoria(value){
    const text=String(value||"").trim();
    if(!text)return "Sin categoría";
    return text
        .toLocaleLowerCase("es")
        .replace(/(^|[\s\-/])([a-záéíóúñü])/g,(m,sep,char)=>sep+char.toLocaleUpperCase("es"));
}

function normalizarClaveMarca(value){
    const text=String(value||"").trim();
    if(!text)return "sin-marca";
    const key=text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toLocaleLowerCase("es")
        .replace(/[^a-z0-9]+/g,"-")
        .replace(/^-+|-+$/g,"");
    return key==="tcl" ? "tica" : (key || "sin-marca");
}

function construirMarcas(productos=[]){
    const section=document.getElementById("marcas");
    const track=document.getElementById("brand-marquee-track");
    if(!section||!track)return;

    section.hidden=false;

    const counts=new Map();
    productos.forEach(producto=>{
        const key=normalizarClaveMarca(producto?.marca);
        counts.set(key,(counts.get(key)||0)+1);
    });

    const renderSet=(copyIndex)=>DORADO_BRANDS.map(brand=>{
        const count=counts.get(brand.key)||0;
        const active=marcaActiva===brand.key;
        const countLabel=count===1?"1 producto":`${count} productos`;
        return `
            <button
                class="brand-marquee-card${active?" active":""}"
                type="button"
                data-brand="${textoSeguro(brand.key)}"
                data-brand-copy="${copyIndex}"
                aria-pressed="${active?"true":"false"}"
                aria-label="Ver productos de ${textoSeguro(brand.name)}"
            >
                <span class="brand-sprite-logo" style="--brand-pos:${spritePosition(brand.sprite)}" aria-hidden="true"></span>
                <span class="brand-marquee-meta">
                    <strong>${textoSeguro(brand.name)}</strong>
                    <small>${textoSeguro(countLabel)}</small>
                </span>
            </button>
        `;
    }).join("");

    track.innerHTML=`
        <div class="brand-marquee-set">${renderSet(0)}</div>
        <div class="brand-marquee-set" aria-hidden="true">${renderSet(1)}</div>
    `;

    track.querySelectorAll(".brand-marquee-card").forEach(card=>{
        card.addEventListener("click",()=>{
            const key=card.dataset.brand||"";
            seleccionarMarca(key,{scroll:true});
        });
    });

    actualizarContextoMarca(counts);
}

function actualizarContextoMarca(counts=null){
    const context=document.getElementById("catalog-brand-context");
    const logo=document.getElementById("catalog-brand-logo");
    const name=document.getElementById("catalog-brand-name");
    const count=document.getElementById("catalog-brand-count");
    if(!context||!logo||!name||!count)return;

    if(marcaActiva==="todas"){
        context.hidden=true;
        return;
    }

    const brand=marcaDefPorClave(marcaActiva);
    if(!brand){
        context.hidden=true;
        return;
    }

    const total=counts instanceof Map
        ? (counts.get(brand.key)||0)
        : [...catalogoProductos.values()].filter(item=>normalizarClaveMarca(item?.marca)===brand.key).length;

    context.hidden=false;
    logo.style.setProperty("--brand-pos",spritePosition(brand.sprite));
    logo.dataset.brand=brand.key;
    name.textContent=brand.name;
    count.textContent=total===1?"1 producto disponible":`${total} productos disponibles`;
}

function seleccionarMarca(key,{scroll=false}={}){
    const brand=marcaDefPorClave(key);
    if(!brand)return;

    marcaActiva=brand.key;
    categoriaActiva="todos";
    catalogoExpandido=true;

    const search=document.getElementById("product-search");
    if(search)search.value="";

    construirFiltrosCategorias([...catalogoProductos.values()]);
    actualizarFiltroCatalogo();
    construirMarcas([...catalogoProductos.values()]);

    if(scroll){
        requestAnimationFrame(()=>{
            const target=document.getElementById("catalog-brand-context");
            (target && !target.hidden ? target : document.getElementById("categorias"))
                ?.scrollIntoView({behavior:"smooth",block:"start"});
        });
    }
}

function limpiarMarcaSeleccionada({scroll=false}={}){
    marcaActiva="todas";
    categoriaActiva="todos";
    catalogoExpandido=false;

    const search=document.getElementById("product-search");
    if(search)search.value="";

    construirFiltrosCategorias([...catalogoProductos.values()]);
    actualizarFiltroCatalogo();
    construirMarcas([...catalogoProductos.values()]);

    if(scroll){
        requestAnimationFrame(()=>{
            document.getElementById("marcas")?.scrollIntoView({behavior:"smooth",block:"start"});
        });
    }
}

function syncCategoryLiquidIndicator({animate=true}={}){
    const wrap=document.getElementById("categorias");
    const indicator=wrap?.querySelector(".category-liquid-indicator");
    const active=wrap?.querySelector(".category-chip.active");
    if(!wrap||!indicator||!active)return;

    const apply=()=>{
        const x=active.offsetLeft;
        const y=active.offsetTop;
        const w=active.offsetWidth;
        const h=active.offsetHeight;

        if(!animate)indicator.classList.add("is-instant");
        wrap.style.setProperty("--category-x",`${x}px`);
        wrap.style.setProperty("--category-y",`${y}px`);
        wrap.style.setProperty("--category-scale",String(Math.max(1,w)/100));
        wrap.style.setProperty("--category-h",`${h}px`);

        if(!animate){
            requestAnimationFrame(()=>indicator.classList.remove("is-instant"));
        }
    };

    requestAnimationFrame(apply);
}

function construirFiltrosCategorias(productos = []) {
    const wrap = document.getElementById("categorias");
    if (!wrap) return;

    const source=marcaActiva==="todas"
        ? productos
        : productos.filter(producto=>normalizarClaveMarca(producto?.marca)===marcaActiva);

    const byKey=new Map();
    source.forEach(producto=>{
        const raw=String(producto?.categoria||"").trim();
        const key=normalizarClaveCategoria(raw);
        if(!byKey.has(key)){
            byKey.set(key,{
                key,
                label:key==="sin-categoria"?"Sin categoría":etiquetaCategoria(raw),
                count:0
            });
        }
        byKey.get(key).count+=1;
    });

    const categorias=[...byKey.values()].sort((a,b)=>{
        if(a.key==="sin-categoria")return 1;
        if(b.key==="sin-categoria")return -1;
        return a.label.localeCompare(b.label,"es",{sensitivity:"base"});
    });

    if(categoriaActiva!=="todos"&&!byKey.has(categoriaActiva)){
        categoriaActiva="todos";
    }

    // Sin contadores: el foco visual queda en la categoría.
    const allButton=`<button class="category-chip${categoriaActiva==="todos"?" active":""}" type="button" data-category="todos" aria-pressed="${categoriaActiva==="todos"?"true":"false"}">Todos</button>`;
    const categoryButtons=categorias.map(cat=>`
        <button class="category-chip${cat.key===categoriaActiva?" active":""}" type="button" data-category="${textoSeguro(cat.key)}" aria-pressed="${cat.key===categoriaActiva?"true":"false"}">
            ${textoSeguro(cat.label)}
        </button>`).join("");

    wrap.innerHTML=`<span class="category-liquid-indicator" aria-hidden="true"></span>`+allButton+categoryButtons;

    wrap.querySelectorAll(".category-chip").forEach(btn=>btn.addEventListener("click",()=>{
        const key=btn.dataset.category||"todos";

        // Dentro de una marca, tocar de nuevo la categoría activa vuelve
        // a mostrar todos los productos de esa marca sin agregar un chip "Todos".
        if(marcaActiva!=="todas" && categoriaActiva===key){
            categoriaActiva="todos";
        }else{
            categoriaActiva=key;
        }

        wrap.querySelectorAll(".category-chip").forEach(b=>{
            const active=(b.dataset.category||"todos")===categoriaActiva;
            b.classList.toggle("active",active);
            b.setAttribute("aria-pressed",String(active));
        });
        actualizarFiltroCatalogo();
        syncCategoryLiquidIndicator({animate:true});
    }));

    syncCategoryLiquidIndicator({animate:false});
}

function normalizarTextoBusqueda(value){
    return String(value||"")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .toLocaleLowerCase("es")
        .replace(/[^a-z0-9]+/g," ")
        .trim();
}

function actualizarFiltroCatalogo() {
    const input = document.getElementById("product-search");
    const contador = document.getElementById("product-result-count");
    const clear = document.getElementById("product-search-clear");
    const grid = document.getElementById("products-grid");
    const moreWrap = document.getElementById("catalog-more-wrap");
    const moreButton = document.getElementById("catalog-more-button");
    const query = normalizarTextoBusqueda(input?.value || "");
    const cards = Array.from(document.querySelectorAll("#products-grid .product"));
    const hasActiveFilter = Boolean(query) || categoriaActiva !== "todos" || marcaActiva !== "todas";

    let matches = 0;
    let shown = 0;

    cards.forEach(card => {
        const coincideTexto = !query || normalizarTextoBusqueda(card.dataset.search || card.textContent || "").includes(query);
        const coincideCategoria = categoriaActiva === "todos" || String(card.dataset.categoryKey || "sin-categoria") === categoriaActiva;
        const coincideMarca = marcaActiva === "todas" || String(card.dataset.brandKey || "sin-marca") === marcaActiva;
        const coincide = coincideTexto && coincideCategoria && coincideMarca;

        if(coincide)matches += 1;

        const overInitialLimit = coincide &&
            !hasActiveFilter &&
            !catalogoExpandido &&
            matches > CATALOG_INITIAL_LIMIT;

        card.hidden = !coincide || overInitialLimit;
        if(coincide&&!overInitialLimit)shown += 1;
    });

    if (clear) clear.hidden = !query;

    let empty = grid?.querySelector(".catalog-empty-filter");
    if (cards.length && matches === 0 && hasActiveFilter) {
        if (!empty && grid) {
            empty = document.createElement("div");
            empty.className = "catalog-empty-filter";
            empty.setAttribute("role", "status");
            grid.appendChild(empty);
        }
        if (empty) {
            empty.hidden = false;
            empty.textContent = query
                ? `No encontramos productos que coincidan con “${input.value.trim()}”. Probá otra búsqueda, categoría o marca.`
                : marcaActiva !== "todas"
                    ? "No hay productos disponibles de esta marca con los filtros elegidos."
                    : "No hay productos disponibles en esta categoría por el momento.";
        }
    } else if (empty) {
        empty.hidden = true;
    }

    if (contador) {
        if (!cards.length) contador.textContent = "Sin productos disponibles";
        else if (hasActiveFilter) contador.textContent = `${matches} ${matches === 1 ? "resultado" : "resultados"}`;
        else if(!catalogoExpandido && matches>CATALOG_INITIAL_LIMIT) contador.textContent = `Mostrando ${shown} de ${matches} productos`;
        else contador.textContent = `${matches} ${matches === 1 ? "producto" : "productos"} disponibles`;
    }

    if(moreWrap&&moreButton){
        const shouldOfferMore=!hasActiveFilter&&matches>CATALOG_INITIAL_LIMIT;
        moreWrap.hidden=!shouldOfferMore;
        moreButton.setAttribute("aria-expanded",String(catalogoExpandido));
        const label=moreButton.querySelector("span");
        if(label){
            label.textContent=catalogoExpandido
                ? "MOSTRAR MENOS"
                : `VER TODOS LOS ${matches} PRODUCTOS`;
        }
        moreButton.classList.toggle("expanded",catalogoExpandido);
    }
}

const productSearch=document.getElementById("product-search");
productSearch?.addEventListener("input",()=>{
    const query=normalizarTextoBusqueda(productSearch.value);

    // La búsqueda principal es global: no queda limitada por una marca/categoría
    // que el usuario haya seleccionado antes.
    if(query&&(marcaActiva!=="todas"||categoriaActiva!=="todos")){
        marcaActiva="todas";
        categoriaActiva="todos";
        construirFiltrosCategorias([...catalogoProductos.values()]);
        construirMarcas([...catalogoProductos.values()]);
    }

    catalogoExpandido=Boolean(query);
    actualizarFiltroCatalogo();
});
document.getElementById("product-search-clear")?.addEventListener("click",()=>{
    if(!productSearch) return;
    productSearch.value="";
    productSearch.focus();
    catalogoExpandido=false;
    actualizarFiltroCatalogo();
});

document.getElementById("catalog-more-button")?.addEventListener("click",()=>{
    catalogoExpandido=!catalogoExpandido;
    actualizarFiltroCatalogo();
    if(!catalogoExpandido){
        document.getElementById("productos")?.scrollIntoView({behavior:"smooth",block:"start"});
    }
});

document.getElementById("catalog-brand-clear")?.addEventListener("click",()=>{
    limpiarMarcaSeleccionada();
});

let brandsCollapseTimer=0;

function actualizarVistaTodasMarcas(force=null){
    const section=document.getElementById("marcas");
    const button=document.getElementById("brand-show-all");
    if(!section||!button)return;

    const next=typeof force==="boolean" ? force : !marcasExpandidas;
    marcasExpandidas=next;
    window.clearTimeout(brandsCollapseTimer);

    if(next){
        section.classList.remove("brands-closing");
        section.classList.add("brands-expanded","brands-opening");
        requestAnimationFrame(()=>{
            requestAnimationFrame(()=>section.classList.remove("brands-opening"));
        });
    }else{
        section.classList.remove("brands-opening");
        section.classList.add("brands-closing");
        brandsCollapseTimer=window.setTimeout(()=>{
            section.classList.remove("brands-expanded","brands-closing");
        },300);
    }

    button.setAttribute("aria-expanded",String(next));

    const textNode=[...button.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
    if(textNode)textNode.nodeValue=next?"VER MENOS ":"VER TODAS ";
}

document.getElementById("brand-show-all")?.addEventListener("click",()=>{
    if(marcaActiva!=="todas"){
        limpiarMarcaSeleccionada();
        actualizarVistaTodasMarcas(true);
        return;
    }
    actualizarVistaTodasMarcas();
});

(function configurarUIVisual(){
    const header = document.getElementById("site-header");
    if(header && "IntersectionObserver" in window){
        const sentinel=document.createElement("span");
        sentinel.className="nav-scroll-sentinel";
        sentinel.setAttribute("aria-hidden","true");
        document.body.insertBefore(sentinel,document.body.firstChild);

        const navObserver=new IntersectionObserver(([entry])=>{
            header.classList.toggle("scrolled",!entry.isIntersecting);
        },{threshold:0});
        navObserver.observe(sentinel);
    }

    // El sistema motion-enhanced anima únicamente los elementos que lo necesitan.
    // Marcamos los contenedores reveal como visibles para evitar dos sistemas de
    // animación compitiendo entre sí.
    document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-visible"));

    // Hero depth only on pointer devices; mobile remains static and lightweight.
    const stage = document.querySelector(".hero-product-stage");
    if (stage && window.matchMedia("(pointer:fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let pointerRaf = 0;
        let pointerEvent = null;

        const paintPointerDepth = () => {
            pointerRaf = 0;
            const event = pointerEvent;
            if (!event) return;

            const rect = stage.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - .5;
            const y = (event.clientY - rect.top) / rect.height - .5;
            stage.style.setProperty("--mx", `${x * 8}px`);
            stage.style.setProperty("--my", `${y * 8}px`);

            const image = stage.querySelector(".hero-product-image");
            if (image) image.style.transform = `translate3d(${x * 7}px, ${y * 5 - 3}px, 0) scale(1.018)`;
        };

        stage.addEventListener("pointermove", event => {
            pointerEvent = event;
            if (!pointerRaf) pointerRaf = requestAnimationFrame(paintPointerDepth);
        }, { passive:true });

        stage.addEventListener("pointerleave", () => {
            pointerEvent = null;
            if (pointerRaf) {
                cancelAnimationFrame(pointerRaf);
                pointerRaf = 0;
            }
            const image = stage.querySelector(".hero-product-image");
            if (image) image.style.transform = "";
        });
    }
})();


renderCarrito();
cargarProductosDesdeSupabase();
comprobarRetornoPago();


// Navegación móvil: Inicio mientras el hero/portada sigue siendo la zona principal
// y Productos una vez que el catálogo alcanza aproximadamente el centro visual.
// Se usa scroll pasivo + requestAnimationFrame para evitar estados incorrectos en Safari/iOS.
(function configurarDockMovil(){
    const dock=document.querySelector('.mobile-dock');
    const items = Array.from(document.querySelectorAll('.mobile-dock-item[data-dock]'));
    const allItems=dock?Array.from(dock.querySelectorAll('.mobile-dock-item')):[];
    const productos = document.getElementById('productos');
    if (!dock || !items.length || !productos) return;

    const setLiquidToItem=(item,{instant=false}={})=>{
        const index=allItems.indexOf(item);
        if(index<0)return;
        dock.classList.toggle('dock-instant',instant);
        dock.style.setProperty('--dock-index',String(index));
        if(instant)requestAnimationFrame(()=>dock.classList.remove('dock-instant'));
    };

    const mobileQuery = window.matchMedia('(max-width: 900px)');
    let scheduled = false;
    let lastActive = '';

    const setActive = id => {
        if (lastActive === id) return;
        lastActive = id;

        items.forEach(item => {
            const active = item.dataset.dock === id;
            item.classList.toggle('active', active);
            if (active) {
                item.setAttribute('aria-current','page');
                setLiquidToItem(item);
            } else {
                item.removeAttribute('aria-current');
            }
        });
    };

    const syncDock = () => {
        scheduled = false;
        if (!mobileQuery.matches) return;

        const viewport = Math.max(window.innerHeight || 0, 1);
        const productsTop = productos.getBoundingClientRect().top;
        const switchLine = viewport * 0.48;

        setActive(productsTop <= switchLine ? 'productos' : 'inicio');
    };

    const requestSync = () => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(syncDock);
    };

    allItems.forEach(item=>{
        item.addEventListener('pointerdown',()=>{
            if(!mobileQuery.matches)return;
            setLiquidToItem(item);
        },{passive:true});
    });

    items.forEach(item => {
        item.addEventListener('click', () => {
            if (!mobileQuery.matches) return;
            const id = item.dataset.dock;
            if (id) setActive(id);
        });
    });

    window.addEventListener('scroll', requestSync, { passive:true });
    window.addEventListener('resize', requestSync, { passive:true });
    window.addEventListener('pageshow', requestSync);
    mobileQuery.addEventListener?.('change', requestSync);

    requestSync();
})();
// ==============================

(() => {
  const header=document.getElementById("site-header");
  const toggle=document.getElementById("menu-toggle");
  const drawer=document.getElementById("mobile-menu-drawer");
  const overlay=document.getElementById("mobile-menu-overlay");
  const closeButton=document.getElementById("mobile-menu-close");
  const brands=document.getElementById("mobile-menu-brands");
  const categories=document.getElementById("mobile-menu-categories");
  const searchForm=document.getElementById("mobile-menu-search-form");
  const searchInput=document.getElementById("mobile-menu-search-input");
  const cartAction=document.getElementById("mobile-menu-cart");
  const ordersAction=document.getElementById("mobile-menu-orders");
  const cartCount=document.getElementById("mobile-menu-cart-count");

  if(!header||!toggle||!drawer||!overlay)return;

  const renderBrands=()=>{
    if(!brands)return;

    brands.innerHTML=DORADO_BRANDS.map(brand=>`
      <button type="button" data-mobile-brand="${textoSeguro(brand.key)}">
        <span>${textoSeguro(brand.name)}</span>
      </button>`
    ).join("");

    brands.querySelectorAll("[data-mobile-brand]").forEach(button=>{
      button.addEventListener("click",()=>{
        const key=String(button.dataset.mobileBrand||"");
        seleccionarMarca(key,{scroll:true});
        closeMenu();
      });
    });
  };

  const renderCategories=()=>{
    if(!categories)return;

    const map=new Map();
    [...catalogoProductos.values()].forEach(product=>{
      const raw=String(product?.categoria||"").trim();
      const key=normalizarClaveCategoria(raw);
      if(!map.has(key)){
        map.set(key,{key,label:key==="sin-categoria"?"Sin categoría":etiquetaCategoria(raw),count:0});
      }
      map.get(key).count+=1;
    });

    const rows=[...map.values()].sort((a,b)=>{
      if(a.key==="sin-categoria")return 1;
      if(b.key==="sin-categoria")return -1;
      return a.label.localeCompare(b.label,"es",{sensitivity:"base"});
    });

    categories.innerHTML=rows.length
      ? rows.map(item=>`<button type="button" data-mobile-category="${textoSeguro(item.key)}"><span>${textoSeguro(item.label)}</span></button>`).join("")
      : '<span class="mobile-menu-loading">Todavía no hay categorías disponibles.</span>';

    categories.querySelectorAll("[data-mobile-category]").forEach(button=>{
      button.addEventListener("click",()=>{
        const key=String(button.dataset.mobileCategory||"todos");
        marcaActiva="todas";
        categoriaActiva=key;
        catalogoExpandido=true;

        const search=document.getElementById("product-search");
        if(search)search.value="";

        construirFiltrosCategorias([...catalogoProductos.values()]);
        actualizarFiltroCatalogo();
        construirMarcas([...catalogoProductos.values()]);
        closeMenu();

        requestAnimationFrame(()=>{
          document.getElementById("productos")?.scrollIntoView({behavior:"smooth",block:"start"});
        });
      });
    });
  };

  const syncCartCount=()=>{
    if(!cartCount)return;
    const source=document.getElementById("cart-count");
    cartCount.textContent=String(source?.textContent||cantidadTotal(leerCarrito())||0);
  };

  const openMenu=()=>{
    renderBrands();
    renderCategories();
    syncCartCount();
    header.classList.add("menu-open");
    document.body.classList.add("menu-open");
    drawer.setAttribute("aria-hidden","false");
    overlay.setAttribute("aria-hidden","false");
    toggle.setAttribute("aria-expanded","true");
    toggle.setAttribute("aria-label","Cerrar menú");
    requestAnimationFrame(()=>closeButton?.focus({preventScroll:true}));
  };

  const closeMenu=()=>{
    header.classList.remove("menu-open");
    document.body.classList.remove("menu-open");
    drawer.setAttribute("aria-hidden","true");
    overlay.setAttribute("aria-hidden","true");
    toggle.setAttribute("aria-expanded","false");
    toggle.setAttribute("aria-label","Abrir menú");
  };

  const closeMenuAnimated=(source)=>{
    if(drawer.classList.contains("is-close-press"))return;
    drawer.classList.add("is-close-press");
    source?.classList.add("is-close-press");

    window.setTimeout(()=>{
      closeMenu();
      window.setTimeout(()=>{
        drawer.classList.remove("is-close-press");
        source?.classList.remove("is-close-press");
      },360);
    },120);
  };

  toggle.addEventListener("click",()=>{
    document.body.classList.contains("menu-open")
      ? closeMenuAnimated(toggle)
      : openMenu();
  });

  closeButton?.addEventListener("click",()=>closeMenuAnimated(closeButton));
  overlay.addEventListener("click",closeMenu);

  drawer.querySelectorAll('a[href^="#"]').forEach(link=>{
    link.addEventListener("click",closeMenu);
  });

  searchForm?.addEventListener("submit",event=>{
    event.preventDefault();
    const query=String(searchInput?.value||"").trim();
    marcaActiva="todas";
    categoriaActiva="todos";
    catalogoExpandido=true;

    const search=document.getElementById("product-search");
    if(search){
      search.value=query;
      search.dispatchEvent(new Event("input",{bubbles:true}));
    }

    construirFiltrosCategorias([...catalogoProductos.values()]);
    construirMarcas([...catalogoProductos.values()]);
    actualizarFiltroCatalogo();
    closeMenu();

    requestAnimationFrame(()=>{
      document.getElementById("productos")?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  });

  cartAction?.addEventListener("click",()=>{
    closeMenu();
    window.setTimeout(()=>abrirCarrito(),80);
  });

  ordersAction?.addEventListener("click",()=>{
    closeMenu();
    window.setTimeout(()=>abrirMisPedidos(),80);
  });

  const sourceCartCount=document.getElementById("cart-count");
  if(sourceCartCount&&"MutationObserver" in window){
    new MutationObserver(syncCartCount).observe(sourceCartCount,{childList:true,characterData:true,subtree:true});
  }

  window.addEventListener("resize",()=>{if(window.innerWidth>700)closeMenu();},{passive:true});
  document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenu();});
})();

// ==============================

(function configurarInteraccionPasosDorado(){
  const steps = Array.from(document.querySelectorAll('.dorado-buy-flow .process-step'));
  if (!steps.length) return;

  let timer = 0;
  const activar = (step) => {
    steps.forEach(item => item.classList.toggle('is-active', item === step));
    window.clearTimeout(timer);
    timer = window.setTimeout(() => step.classList.remove('is-active'), 1400);
  };

  steps.forEach(step => {
    step.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.pointerType === 'pen') activar(step);
    }, { passive:true });
    step.addEventListener('click', () => {
      if (window.matchMedia('(hover:none)').matches) activar(step);
    });
  });
})();

// ==============================

(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;
  document.documentElement.classList.add('motion-enhanced');

  let observer = null;
  const watched = new WeakSet();

  const show = (el) => {
    if (!el) return;
    el.classList.add('motion-visible');
    observer?.unobserve(el);
  };

  const watch = (el, direction='up', delay=0, heading=false) => {
    if (!el || watched.has(el)) return;
    watched.add(el);
    el.classList.add('motion-item', `motion-${direction}`);
    if (heading) el.classList.add('motion-heading');
    el.style.setProperty('--motion-delay', `${Math.min(Math.max(0, delay), 180)}ms`);

    if (reduce || !canObserve) {
      show(el);
      return;
    }

    const rect = el.getBoundingClientRect();
    const inView = rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight * .86 && rect.bottom > 0;
    if (inView) {
      requestAnimationFrame(() => show(el));
      return;
    }
    observer?.observe(el);
  };

  if (!reduce && canObserve) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) show(entry.target);
      });
    }, { threshold:.14, rootMargin:'0px 0px -14% 0px' });
  }

  const group = (selector, directions=['up'], step=48, start=0, heading=false) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      watch(el, directions[i % directions.length], Math.min(start + i * step, 180), heading);
    });
  };

  /* Servicio: entra desde ambos costados, como una sola composición. */
  group('.features .feature', ['left','right','left','right'], 42, 0);

  /* Historia: imagen y texto se encuentran desde lados opuestos. */
  group('.dorado-story-visual', ['left'], 0, 0);
  group('.dorado-story-copy', ['right'], 0, 45);
  group('.about-highlights .about-highlight', ['left','up','right'], 42, 90);

  /* Catálogo: encabezado y herramientas llegan desde lados distintos. */
  group('.catalog-heading-row .catalog-copy', ['left'], 0, 0, true);
  group('.catalog-tools', ['right'], 0, 70);
  group('.catalog-promises > *', ['up'], 35, 85);

  /* Productos: alternancia controlada. No se anima durante el scroll una vez visibles. */
  const productGrid = document.getElementById('products-grid');
  const registerProducts = () => {
    if (!productGrid) return;
    productGrid.querySelectorAll('.product').forEach((card, i) => {
      const dirs=['left','up','right','up'];
      watch(card, dirs[i % dirs.length], Math.min((i % 4) * 36, 108));
    });
  };

  /* Más elegidos: heading + cards reales si la sección existe. */
  group('#mas-elegidos .section-head-copy', ['left'], 0, 0, true);
  const bestGrid=document.getElementById('best-sellers-grid');
  const registerBest=()=>{
    bestGrid?.querySelectorAll('.best-seller-card').forEach((card,i)=>{
      watch(card,['left','up','right'][i%3],Math.min(i*45,135));
    });
  };

  /* Compra: texto estable y pasos que se alternan desde cada lado. */
  group('.process-intro', ['left'], 0, 0, true);
  group('.process-steps .process-step', ['right','left','right','left'], 48, 55);

  /* Confianza: título y acciones se encuentran, contenido sube suavemente. */
  group('.trust-section .section-head-copy', ['left'], 0, 0, true);
  group('.trust-section .reviews-actions', ['right'], 0, 55);
  group('.reviews-marquee-shell', ['up'], 0, 80);
  group('.reviews-filter-panel', ['scale'], 0, 40);

  /* FAQ: dos columnas desde lados opuestos. */
  group('.faq-intro', ['left'], 0, 0, true);
  group('.faq-list', ['right'], 0, 55);

  /* Contacto: información y mapa se encuentran desde ambos lados. */
  group('.location-copy', ['left'], 0, 0, true);
  group('.location-box > .map', ['right'], 0, 55);
  group('.contact-list .contact-line', ['left','right'], 38, 80);
  group('.contact-actions', ['up'], 0, 120);

  /* Footer: cierre editorial, más corto para no sentirse teatral. */
  group('.footer-brand-box', ['left'], 0, 0);
  group('.footer-column', ['up','right','up'], 35, 30);
  group('.footer-bottom', ['up'], 0, 55);

  if (productGrid) {
    registerProducts();
    let productRegisterRaf = 0;
    const productObserver = new MutationObserver(() => {
      if (productRegisterRaf) return;
      productRegisterRaf = requestAnimationFrame(() => {
        productRegisterRaf = 0;
        registerProducts();
      });
    });
    productObserver.observe(productGrid, { childList:true });
  }

  if(bestGrid){
    registerBest();
    const bestObserver=new MutationObserver(registerBest);
    bestObserver.observe(bestGrid,{childList:true});
  }
})();

/* =========================================================
   CHECKOUT — AUTOCOMPLETADO DE DIRECCIÓN (ARGENTINA)
   Mientras el cliente escribe calle + altura, muestra
   sugerencias y completa automáticamente localidad/provincia.
   Si el servicio no responde, el checkout sigue manual.
========================================================= */
(function iniciarAutocompletadoDireccion() {
    const input = document.getElementById("checkout-address");
    const cityInput = document.getElementById("checkout-city");
    const provinceSelect = document.getElementById("checkout-province");
    const postalInput = document.getElementById("checkout-postal");

    if (!input || !cityInput || !provinceSelect) return;

    const field = input.closest(".checkout-field");
    if (!field) return;

    field.classList.add("checkout-address-field");

    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", "checkout-address-suggestions");
    input.setAttribute("spellcheck", "false");
    input.placeholder = "Ej.: Av. Corrientes 1234";

    const helper = document.createElement("div");
    helper.className = "checkout-address-helper";
    helper.id = "checkout-address-helper";
    helper.textContent = "Escribí calle y altura para ver sugerencias.";

    const list = document.createElement("div");
    list.className = "checkout-address-suggestions";
    list.id = "checkout-address-suggestions";
    list.setAttribute("role", "listbox");
    list.hidden = true;

    field.appendChild(helper);
    field.appendChild(list);

    let timer = null;
    let controller = null;
    let suggestions = [];
    let activeIndex = -1;
    let lastQuery = "";
    let suppressNextInput = false;
    let selectedAddressValue = "";
    let selectingSuggestion = false;
    const addressCache = new Map();
    const MAX_ADDRESS_CACHE = 30;

    function normalizar(value) {
        return String(value || "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    function setProvince(nombre) {
        if (!nombre) return;

        const target = normalizar(nombre);
        const option = Array.from(provinceSelect.options).find(opt => {
            const value = normalizar(opt.value || opt.textContent);
            return value === target;
        });

        if (option) {
            provinceSelect.value = option.value;
            provinceSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
    }

    function closeSuggestions() {
        suggestions = [];
        activeIndex = -1;
        list.innerHTML = "";
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }

    function setActive(index) {
        const options = Array.from(list.querySelectorAll("[role='option']"));
        if (!options.length) return;

        activeIndex = Math.max(0, Math.min(index, options.length - 1));

        options.forEach((option, idx) => {
            const active = idx === activeIndex;
            option.classList.toggle("active", active);
            option.setAttribute("aria-selected", active ? "true" : "false");
        });

        const active = options[activeIndex];
        if (active) {
            input.setAttribute("aria-activedescendant", active.id);
            active.scrollIntoView({ block: "nearest" });
        }
    }

    function chooseSuggestion(index) {
        const item = suggestions[index];
        if (!item) return;

        clearTimeout(timer);
        controller?.abort();

        const selectedValue = item.address || item.label || "";
        selectedAddressValue = normalizar(selectedValue);
        lastQuery = selectedValue;

        /* Evita que el "input" programático vuelva a disparar
           una búsqueda justo después de seleccionar una dirección. */
        suppressNextInput = true;
        input.value = selectedValue;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));

        if (item.city) {
            cityInput.value = item.city;
            cityInput.dispatchEvent(new Event("input", { bubbles: true }));
            cityInput.dispatchEvent(new Event("change", { bubbles: true }));
        }

        if (item.province) {
            setProvince(item.province);
        }

        helper.textContent = "Dirección seleccionada. Completá el código postal.";
        helper.classList.add("selected");
        closeSuggestions();

        if (postalInput) {
            window.setTimeout(() => postalInput.focus(), 80);
        }
    }

    function renderSuggestions(items) {
        suggestions = Array.isArray(items) ? items : [];
        activeIndex = -1;
        list.innerHTML = "";

        if (!suggestions.length) {
            closeSuggestions();
            return;
        }

        /* Si ya hay localidad/provincia cargadas y una sola sugerencia coincide,
           la seleccionamos automáticamente. Esto evita dejar el desplegable abierto
           cuando el domicilio ya está claro. */
        const cityValue = normalizar(cityInput.value);
        const provinceValue = normalizar(
            provinceSelect.options[provinceSelect.selectedIndex]?.textContent ||
            provinceSelect.value
        );

        if (/\d/.test(String(input.value || ""))) {
            const matchingIndexes = suggestions
                .map((item, index) => ({ item, index }))
                .filter(({ item }) => {
                    const sameCity = !cityValue || normalizar(item.city) === cityValue;
                    const sameProvince = !provinceValue ||
                        normalizar(item.province) === provinceValue;
                    return sameCity && sameProvince;
                })
                .map(({ index }) => index);

            if (matchingIndexes.length === 1) {
                chooseSuggestion(matchingIndexes[0]);
                return;
            }

            if (suggestions.length === 1) {
                chooseSuggestion(0);
                return;
            }
        }

        suggestions.forEach((item, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "checkout-address-option";
            button.id = `checkout-address-option-${index}`;
            button.setAttribute("role", "option");
            button.setAttribute("aria-selected", "false");

            const main = document.createElement("strong");
            main.textContent = item.address || item.label || "Dirección";

            const meta = document.createElement("span");
            meta.textContent = [item.city, item.province]
                .filter(Boolean)
                .join(" · ");

            button.appendChild(main);
            if (meta.textContent) button.appendChild(meta);

            /* En celular, el blur del input puede ocurrir antes del click.
               Seleccionamos en pointerdown para que iOS/Android no cierre la
               lista antes de poder completar la dirección. */
            button.addEventListener("pointerdown", event => {
                selectingSuggestion = true;
                event.preventDefault();
                chooseSuggestion(index);
                window.setTimeout(() => {
                    selectingSuggestion = false;
                }, 0);
            });

            /* Fallback para navegadores sin Pointer Events. */
            button.addEventListener("touchstart", event => {
                if (window.PointerEvent) return;
                selectingSuggestion = true;
                event.preventDefault();
                chooseSuggestion(index);
                window.setTimeout(() => {
                    selectingSuggestion = false;
                }, 0);
            }, { passive: false });

            button.addEventListener("click", event => {
                event.preventDefault();
                if (list.hidden) return;
                chooseSuggestion(index);
            });

            list.appendChild(button);
        });

        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        helper.textContent = "Elegí la dirección correcta de la lista. Las sugerencias quedan visibles hasta que selecciones una.";
    }

    async function searchAddress() {
        const q = String(input.value || "").trim();

        if (q.length < 4) {
            helper.textContent = "Escribí calle y altura para ver sugerencias.";
            helper.classList.remove("selected");
            closeSuggestions();
            return;
        }

        if (q === lastQuery && suggestions.length) return;
        lastQuery = q;

        controller?.abort();
        controller = new AbortController();

        const params = new URLSearchParams({ q });
        if (provinceSelect.value) {
            params.set("provincia", provinceSelect.value);
        }

        const cacheKey = `${normalizar(q)}|${normalizar(provinceSelect.value)}`;
        const cached = addressCache.get(cacheKey);
        if (cached) {
            renderSuggestions(cached);
            if (!cached.length) {
                helper.textContent = "No encontramos coincidencias. Podés escribirla manualmente.";
            }
            return;
        }

        helper.textContent = "Buscando dirección…";
        helper.classList.remove("selected");

        try {
            const response = await fetch(`/api/address-search?${params.toString()}`, {
                headers: { "Accept": "application/json" },
                signal: controller.signal
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error("ADDRESS_SEARCH_FAILED");

            if (String(input.value || "").trim() !== q) return;

            const freshSuggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];
            addressCache.set(cacheKey, freshSuggestions);
            if (addressCache.size > MAX_ADDRESS_CACHE) {
                addressCache.delete(addressCache.keys().next().value);
            }
            renderSuggestions(freshSuggestions);

            if (!freshSuggestions.length) {
                helper.textContent = data?.unavailable
                    ? "Podés completar la dirección manualmente."
                    : "No encontramos coincidencias. Podés escribirla manualmente.";
            }
        } catch (error) {
            if (error?.name === "AbortError") return;
            closeSuggestions();
            helper.textContent = "Podés completar la dirección manualmente.";
        }
    }

    input.addEventListener("input", () => {
        clearTimeout(timer);

        if (suppressNextInput) {
            suppressNextInput = false;
            closeSuggestions();
            return;
        }

        const currentValue = normalizar(input.value);

        /* Si el cliente ya eligió una sugerencia y el valor no cambió,
           no mostramos otra vez el desplegable. */
        if (selectedAddressValue && currentValue === selectedAddressValue) {
            helper.textContent = "Dirección seleccionada. Completá el código postal.";
            helper.classList.add("selected");
            closeSuggestions();
            return;
        }

        selectedAddressValue = "";
        helper.classList.remove("selected");
        timer = window.setTimeout(searchAddress, 240);
    });

    input.addEventListener("keydown", event => {
        if (list.hidden || !suggestions.length) return;

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive(activeIndex < 0 ? 0 : activeIndex + 1);
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1);
        } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault();
            chooseSuggestion(activeIndex);
        } else if (event.key === "Escape") {
            closeSuggestions();
        }
    });

    input.addEventListener("focus", () => {
        if (selectedAddressValue &&
            normalizar(input.value) === selectedAddressValue) {
            closeSuggestions();
            return;
        }

        if (suggestions.length) {
            list.hidden = false;
            input.setAttribute("aria-expanded", "true");
            return;
        }

        const current = String(input.value || "").trim();
        if (current.length >= 4) {
            clearTimeout(timer);
            timer = window.setTimeout(searchAddress, 80);
        }
    });

    input.addEventListener("blur", () => {
        if (selectingSuggestion) return;

        const current = String(input.value || "").trim();

        /* No cerramos automáticamente la lista: en móvil debe permanecer
           visible después de dejar de escribir hasta que el usuario elija
           una sugerencia o toque fuera del bloque de domicilio. */
        if (current.length >= 4 && /\d/.test(current) && !selectedAddressValue && !suggestions.length) {
            helper.textContent = "Dirección escrita. Podés elegir una sugerencia para completar localidad y provincia.";
            helper.classList.remove("selected");
        }
    });

    document.addEventListener("pointerdown", event => {
        if (!field.contains(event.target)) {
            closeSuggestions();
        }
    }, true);

    provinceSelect.addEventListener("change", () => {
        lastQuery = "";
    });

    document.getElementById("checkout-modal")?.addEventListener("click", event => {
        if (event.target.id === "checkout-modal") {
            closeSuggestions();
        }
    });
})();



/* DORADO — intro cinematográfica + checkout multimétodo */
(function configurarDorado(){
    const intro=document.getElementById("brand-intro");
    if(intro){
        const seen=sessionStorage.getItem("doradoIntroSeen")==="1";
        const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        const finishIntro=()=>{
            intro.classList.add("hide");
            document.body.style.overflow="";
            document.body.classList.remove("intro-running");
            document.body.classList.add("intro-finished");
            sessionStorage.setItem("doradoIntroSeen","1");
            window.setTimeout(()=>intro.remove(),1500);
        };

        if(seen||reduced){
            intro.classList.add("hide");
            document.body.classList.add("intro-finished");
            window.setTimeout(()=>intro.remove(),50);
        }else{
            document.body.style.overflow="hidden";
            document.body.classList.add("intro-running");

            const introLogo=intro.querySelector(".brand-intro-logo");
            const introTitle=intro.querySelector(".brand-intro-title");
            const introKicker=intro.querySelector(".brand-intro-kicker");
            const introTagline=intro.querySelector(".brand-intro-tagline");
            const navLogo=document.querySelector(".nav-logo");

            /* "BIENVENIDO A" y el slogan inferior entran juntos y duran lo mismo. */
            [introKicker,introTagline].forEach((el)=>{
                el?.animate([
                    {opacity:0,transform:"translateY(8px)",filter:"blur(3px)"},
                    {opacity:1,transform:"translateY(0)",filter:"blur(0)"}
                ],{
                    duration:520,
                    delay:620,
                    easing:"cubic-bezier(.22,.72,.2,1)",
                    fill:"forwards"
                });
            });

            window.setTimeout(()=>{
                if(!introLogo||!introTitle||!navLogo||typeof introLogo.animate!=="function"){
                    intro.classList.add("closing");
                    window.setTimeout(finishIntro,1500);
                    return;
                }

                const logoRect=introLogo.getBoundingClientRect();
                const titleRect=introTitle.getBoundingClientRect();
                const navRect=navLogo.getBoundingClientRect();

                const logoCenterX=logoRect.left+logoRect.width/2;
                const logoCenterY=logoRect.top+logoRect.height/2;

                /* 1) Del centro al costado derecho del nombre.
                   En móvil limitamos el recorrido a la zona visible para que
                   el logo nunca salga por los laterales de la pantalla. */
                const isMobileIntro=window.matchMedia("(max-width:700px)").matches;
                const viewportWidth=Math.max(document.documentElement.clientWidth,window.innerWidth||0);
                const safeEdge=isMobileIntro?Math.max(12,Math.min(18,viewportWidth*.04)):0;
                const minLogoCenter=(logoRect.width/2)+safeEdge;
                const maxLogoCenter=viewportWidth-(logoRect.width/2)-safeEdge;

                const rawRightCenter=titleRect.right+logoRect.width*.70;
                const rawLeftCenter=titleRect.left-logoRect.width*.55;
                const rightTargetCenter=isMobileIntro
                    ? Math.min(maxLogoCenter,titleRect.right-logoRect.width*.10)
                    : rawRightCenter;
                const leftTargetCenter=isMobileIntro
                    ? Math.max(minLogoCenter,titleRect.left+logoRect.width*.10)
                    : rawLeftCenter;

                const rightX=rightTargetCenter-logoCenterX;
                const titleY=(titleRect.top+titleRect.height/2)-logoCenterY;

                /* 2) Barrido de derecha a izquierda por encima de las palabras. */
                const leftX=leftTargetCenter-logoCenterX;
                const travelScale=isMobileIntro?.72:.90;
                const sweepScale=isMobileIntro?.76:.94;

                /* 3) Termina exactamente sobre el logo real del header. */
                const navCenterX=navRect.left+navRect.width/2;
                const navCenterY=navRect.top+navRect.height/2;
                const finalX=navCenterX-logoCenterX;
                const finalY=navCenterY-logoCenterY;
                const finalScale=Math.max(.28,Math.min(1,navRect.width/logoRect.width));

                /*
                 * Secuencia final:
                 * - conserva EXACTAMENTE el título original
                 * - va al costado derecho del título
                 * - barre de derecha a izquierda
                 * - cada letra desaparece EN EL INSTANTE en que el logo la toca
                 * - al terminar el barrido, el logo SUBE RÁPIDO al header
                 */
                const splitIntroTitleIntoChars=()=>{
                    const nodes=[...introTitle.children];
                    nodes.forEach((node)=>{
                        const original=node.textContent||"";
                        node.textContent="";
                        [...original].forEach((char)=>{
                            const charSpan=document.createElement("span");
                            charSpan.className=char===" " ? "intro-char intro-space" : "intro-char";
                            charSpan.textContent=char===" " ? "\u00a0" : char;
                            node.appendChild(charSpan);
                        });
                    });
                };



                const placeLogo=(x,y,scale)=>{
                    introLogo.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
                };

                /* 1) Centro -> derecha del título */
                const toRight=introLogo.animate([
                    {transform:"translate3d(0,0,0) scale(1)"},
                    {transform:`translate3d(${rightX}px,${titleY}px,0) scale(${travelScale})`}
                ],{
                    duration:950,
                    easing:"cubic-bezier(.22,.78,.18,1)",
                    fill:"forwards"
                });

                toRight.onfinish=()=>{
                    placeLogo(rightX,titleY,travelScale);
                    toRight.cancel();

                    /* El texto sigue diciendo exactamente:
                       DORADO / ARTÍCULOS DE PESCA */
                    splitIntroTitleIntoChars();
                    const titleChars=[...introTitle.querySelectorAll(".intro-char:not(.intro-space)")];

                    /* Cacheamos una sola vez la geometría de las letras.
                       Antes se hacía getBoundingClientRect() para cada letra en
                       cada frame, lo que podía provocar tirones en la intro. */
                    const charRects=titleChars.map((char)=>({
                        char,
                        rect:char.getBoundingClientRect()
                    }));
                    let pendingChars=charRects.length;
                    let sweepRaf=0;
                    let lastSweepCheck=0;

                    const hideTouchedChars=(timestamp=0)=>{
                        /* ~30 comprobaciones por segundo son suficientes para
                           una desaparición instantánea visual, con mucho menos
                           trabajo de layout que hacerlo a 60/120 Hz. */
                        if(timestamp-lastSweepCheck < 32){
                            sweepRaf=requestAnimationFrame(hideTouchedChars);
                            return;
                        }
                        lastSweepCheck=timestamp;

                        const logoNow=introLogo.getBoundingClientRect();

                        for(const item of charRects){
                            if(item.char.classList.contains("swept")) continue;
                            const r=item.rect;
                            const overlaps=
                                logoNow.left <= r.right &&
                                logoNow.right >= r.left &&
                                logoNow.top <= r.bottom &&
                                logoNow.bottom >= r.top;

                            if(overlaps){
                                item.char.classList.add("swept");
                                pendingChars--;
                            }
                        }

                        if(pendingChars>0){
                            sweepRaf=requestAnimationFrame(hideTouchedChars);
                        }
                    };

                    intro.classList.add("sweeping");
                    sweepRaf=requestAnimationFrame(hideTouchedChars);

                    /* 2) Barrido derecha -> izquierda sobre el texto */
                    const sweep=introLogo.animate([
                        {transform:`translate3d(${rightX}px,${titleY}px,0) scale(${travelScale})`},
                        {transform:`translate3d(${leftX}px,${titleY}px,0) scale(${sweepScale})`}
                    ],{
                        duration:2100,
                        easing:"linear",
                        fill:"forwards"
                    });

                    /* Los textos secundarios salen mientras el logo barre. */
                    window.setTimeout(()=>{
                        [introKicker,introTagline].forEach((el)=>{
                            el?.animate([
                                {opacity:1,transform:"translateY(0)",filter:"blur(0)"},
                                {opacity:0,transform:"translateY(-6px)",filter:"blur(3px)"}
                            ],{
                                duration:420,
                                easing:"ease-out",
                                fill:"forwards"
                            });
                        });

                        /* La línea se retira en el mismo tramo, sin alterar los dos textos chicos. */
                        intro.querySelector(".brand-intro-line")?.animate([
                            {opacity:1},
                            {opacity:0}
                        ],{
                            duration:420,
                            easing:"ease-out",
                            fill:"forwards"
                        });
                    },1320);

                    sweep.onfinish=()=>{
                        cancelAnimationFrame(sweepRaf);
                        titleChars.forEach((char)=>char.classList.add("swept"));
                        placeLogo(leftX,titleY,sweepScale);
                        sweep.cancel();

                        intro.classList.add("fly-to-header");

                        /* 3) Subida RÁPIDA al logo del header */
                        const flyUp=introLogo.animate([
                            {transform:`translate3d(${leftX}px,${titleY}px,0) scale(${sweepScale})`},
                            {transform:`translate3d(${finalX}px,${finalY}px,0) scale(${finalScale})`}
                        ],{
                            duration:500,
                            easing:"cubic-bezier(.30,.78,.24,1)",
                            fill:"forwards"
                        });

                        flyUp.onfinish=()=>{
                            placeLogo(finalX,finalY,finalScale);
                            flyUp.cancel();
                            window.setTimeout(finishIntro,120);
                        };
                    };
                };
            },1300);
        }
    }

    const payment=document.getElementById("checkout-payment-method");
    const delivery=document.getElementById("checkout-delivery");
    const payButton=document.getElementById("checkout-pay");
    const help=document.getElementById("checkout-payment-help");
    const detail=document.getElementById("checkout-payment-detail");
    const panels=Array.from(document.querySelectorAll("[data-payment-panel]"));
    const addressFields=["checkout-address","checkout-city","checkout-province","checkout-postal"].map(id=>document.getElementById(id)).filter(Boolean);

    const updateCheckout=()=>{
        const method=String(payment?.value||"");
        const retiro=delivery?.value==="retiro";
        addressFields.forEach(el=>{el.required=!retiro;el.closest?.(".checkout-field")?.classList.toggle("optional-for-pickup",retiro);});

        if(detail)detail.hidden=!method;
        panels.forEach(panel=>{panel.hidden=panel.dataset.paymentPanel!==method;});

        if(!payButton)return;
        const span=payButton.querySelector("span");
        if(method==="mercadopago"){
            if(span)span.textContent="Continuar con Mercado Pago";
            if(help)help.textContent="Antes de salir de Dorado te vamos a pedir confirmación.";
        }else if(method==="tarjeta"){
            if(span)span.textContent="Pagar con tarjeta";
            if(help)help.textContent="🔒 Número, vencimiento y CVV se tokenizan con Mercado Pago y no se guardan en Dorado.";
            window.__doradoInitCardPayment?.();
        }else if(method==="transferencia"){
            if(span)span.textContent="Confirmar transferencia por WhatsApp";
            if(help)help.textContent="Revisá alias, CBU y titular antes de continuar.";
        }else if(method==="efectivo"){
            if(span)span.textContent="Confirmar pago en efectivo";
            if(help)help.textContent=retiro?"Pagás al retirar tu pedido en el local.":"Elegí retiro en el local para pagar en efectivo.";
        }else if(method==="whatsapp"){
            if(span)span.textContent="Coordinar pedido por WhatsApp";
            if(help)help.textContent="Te preparamos el resumen completo del pedido para coordinar.";
        }else{
            if(span)span.textContent="Elegí un medio de pago";
            if(help)help.textContent="Elegí la opción que te resulte más cómoda para continuar.";
        }
    };

    payment?.addEventListener("change",updateCheckout);
    delivery?.addEventListener("change",updateCheckout);

    document.querySelectorAll(".copy-bank-data").forEach(button=>{
        button.addEventListener("click",async()=>{
            const target=document.getElementById(button.dataset.copyTarget||"");
            const value=String(target?.textContent||"").trim();
            if(!value||/pendiente/i.test(value))return;
            try{
                await navigator.clipboard.writeText(value);
                const original=button.textContent;
                button.textContent="COPIADO";
                window.setTimeout(()=>button.textContent=original,1200);
            }catch{}
        });
    });

    (async()=>{
        try{
            const data=await obtenerConfigPublica();
            const bank=data?.bankTransfer||{};
            const fields={
                "bank-transfer-alias":bank.alias,
                "bank-transfer-cbu":bank.cbu,
                "bank-transfer-holder":bank.holder,
                "bank-transfer-tax-id":bank.taxId,
                "bank-transfer-bank":bank.bank
            };
            Object.entries(fields).forEach(([id,value])=>{
                const el=document.getElementById(id);
                if(el&&value)el.textContent=String(value);
            });
            const complete=Boolean(bank.alias&&bank.cbu&&bank.holder);
            const note=document.getElementById("bank-transfer-note");
            if(note&&complete)note.textContent="Cuando transfieras, guardá el comprobante. Podés enviarlo por WhatsApp junto con tu número de pedido.";
            document.querySelectorAll(".copy-bank-data").forEach(button=>{
                const target=document.getElementById(button.dataset.copyTarget||"");
                button.disabled=!target||/pendiente/i.test(String(target.textContent||""));
            });
        }catch{}
        updateCheckout();
    })();
})();

/* DORADO — selector visual de medios de pago */
(function configurarSelectorVisualDePago(){
    const payment=document.getElementById("checkout-payment-method");
    const delivery=document.getElementById("checkout-delivery");
    const picker=document.getElementById("payment-picker");
    const trigger=document.getElementById("payment-picker-trigger");
    const menu=document.getElementById("payment-picker-menu");
    const label=document.getElementById("payment-picker-label");
    const options=Array.from(document.querySelectorAll(".payment-picker-option[data-payment-value]"));
    if(!payment||!picker||!trigger||!menu||!label||!options.length)return;

    const labels={
        efectivo:"Efectivo al retirar",
        whatsapp:"Coordinar por WhatsApp",
        transferencia:"Transferencia bancaria",
        tarjeta:"Tarjeta de débito / crédito",
        mercadopago:"Mercado Pago"
    };

    const closeMenu=()=>{
        menu.hidden=true;
        picker.classList.remove("is-open");
        trigger.setAttribute("aria-expanded","false");
    };

    const openMenu=()=>{
        menu.hidden=false;
        picker.classList.add("is-open");
        trigger.setAttribute("aria-expanded","true");
    };

    const availabilityFor=value=>{
        if(value==="efectivo") return delivery?.value==="retiro" ? {enabled:true,label:"Disponible"} : {enabled:false,label:"Solo retiro"};
        if(value==="whatsapp"||value==="transferencia") return {enabled:true,label:"Disponible"};
        const availability=window.doradoPaymentAvailability;
        if(value==="mercadopago"){
            const enabled=Boolean(availability?.mercadoPago);
            return {enabled,label:enabled?"Disponible":"A activar"};
        }
        if(value==="tarjeta"){
            const enabled=Boolean(availability?.card);
            return {enabled,label:enabled?"Disponible":"A activar"};
        }
        return {enabled:true,label:"Disponible"};
    };

    const sync=()=>{
        const selected=String(payment.value||"");
        label.textContent=labels[selected]||"Elegí cómo pagar";
        trigger.classList.toggle("has-value",Boolean(selected));

        options.forEach(option=>{
            const value=String(option.dataset.paymentValue||"");
            const selectedOption=value===selected;
            const availability=availabilityFor(value);
            const status=option.querySelector(".payment-picker-status");

            option.classList.toggle("is-selected",selectedOption);
            option.classList.toggle("is-unavailable",!availability.enabled);
            option.setAttribute("aria-selected",selectedOption?"true":"false");
            option.disabled=!availability.enabled;
            if(status)status.textContent=availability.label;
        });
    };

    trigger.addEventListener("click",()=>{
        if(menu.hidden)openMenu();
        else closeMenu();
    });

    options.forEach(option=>{
        option.addEventListener("click",()=>{
            if(option.disabled)return;
            payment.value=String(option.dataset.paymentValue||"");
            payment.dispatchEvent(new Event("change",{bubbles:true}));
            closeMenu();
            trigger.focus({preventScroll:true});
        });
    });

    payment.addEventListener("change",sync);
    delivery?.addEventListener("change",sync);

    document.addEventListener("click",event=>{
        if(!picker.contains(event.target))closeMenu();
    });

    document.addEventListener("keydown",event=>{
        if(event.key==="Escape"&&!menu.hidden){
            closeMenu();
            trigger.focus({preventScroll:true});
        }
    });

    sync();
})();
/* FIN DORADO — selector visual de medios de pago */

/* =========================================================
   EVENTOS SIN JAVASCRIPT INLINE
   Mantiene una CSP más estricta contra XSS.
========================================================= */
(function configurarEventosSeguros(){
    document.getElementById("orders-trigger")?.addEventListener("click", abrirMisPedidos);
    document.getElementById("cart-trigger")?.addEventListener("click", abrirCarrito);

    document.querySelector(".product-detail-close")?.addEventListener("click", cerrarProductoDinamico);

    document.querySelector(".mobile-dock-orders")?.addEventListener("click", abrirMisPedidos);
    document.querySelector(".mobile-dock-cart")?.addEventListener("click", abrirCarrito);

    document.querySelector(".checkout-close")?.addEventListener("click", cerrarCheckout);
    document.querySelector(".checkout-wholesale")?.addEventListener("click", consultarCompraMayorista);

    document.getElementById("orders-overlay")?.addEventListener("click", cerrarMisPedidos);
    document.querySelector(".orders-close")?.addEventListener("click", cerrarMisPedidos);
    document.getElementById("orders-refresh")?.addEventListener("click", () => cargarMisPedidos(true));

    document.getElementById("cart-overlay")?.addEventListener("click", cerrarCarrito);
    document.querySelector(".cart-close")?.addEventListener("click", cerrarCarrito);
    document.getElementById("cart-checkout")?.addEventListener("click", abrirCheckout);
    document.getElementById("checkout-coupon-apply")?.addEventListener("click", aplicarCuponCheckout);
    document.getElementById("checkout-coupon-code")?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); aplicarCuponCheckout(); } });
    document.getElementById("cart-continue")?.addEventListener("click", cerrarCarrito);
    document.getElementById("cart-clear")?.addEventListener("click", vaciarCarrito);
})();

/* =========================================================
   DORADO — UI FINAL: navegación activa, foco, año y detalles UX
   ========================================================= */
(function configurarPulidoFinal(){
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Año automático del footer. */
    const year=document.getElementById("copyright-year");
    if(year) year.textContent=String(new Date().getFullYear());

    /* Navegación principal: estado activo según la sección visible. */
    const navLinks=Array.from(document.querySelectorAll('#primary-navigation a[href^="#"]'));
    const sections=navLinks
        .map(link=>({link,id:link.getAttribute("href").slice(1)}))
        .map(item=>({...item,section:document.getElementById(item.id)}))
        .filter(item=>item.section);

    const setActive=(id)=>{
        sections.forEach(({link,id:linkId})=>{
            const active=linkId===id;
            link.classList.toggle("active",active);
            if(active) link.setAttribute("aria-current","page");
            else link.removeAttribute("aria-current");
        });
    };

    if("IntersectionObserver" in window && sections.length){
        const observer=new IntersectionObserver(entries=>{
            const visible=entries
                .filter(entry=>entry.isIntersecting)
                .sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
            if(visible?.target?.id) setActive(visible.target.id);
        },{rootMargin:"-24% 0px -58% 0px",threshold:[0,.05,.15,.3,.5]});
        sections.forEach(({section})=>observer.observe(section));
    }

    /* Scroll suave respetando reduced motion. */
    document.querySelectorAll('a[href^="#"]').forEach(link=>{
        link.addEventListener("click",event=>{
            const id=link.getAttribute("href")?.slice(1);
            const target=id&&document.getElementById(id);
            if(!target) return;
            event.preventDefault();
            target.scrollIntoView({behavior:reduce?"auto":"smooth",block:"start"});
            history.replaceState(null,"",`#${id}`);
        });
    });

    /* Imágenes dinámicas: decodificación asíncrona por defecto. */
    const prepareImages=(root=document)=>{
        root.querySelectorAll("img").forEach(img=>{
            if(!img.hasAttribute("decoding")) img.decoding="async";
            if(!img.closest(".brand-intro") && !img.classList.contains("nav-logo") && !img.hasAttribute("loading")){
                img.loading="lazy";
            }
        });
    };
    prepareImages();

    const productsGrid=document.getElementById("products-grid");
    if(productsGrid && "MutationObserver" in window){
        let imagePrepareRaf=0;
        new MutationObserver(()=>{
            if(imagePrepareRaf)return;
            imagePrepareRaf=requestAnimationFrame(()=>{
                imagePrepareRaf=0;
                prepareImages(productsGrid);
            });
        }).observe(productsGrid,{childList:true,subtree:true});
    }

    /* Evita que un contador grande de carrito rompa el header. */
    const clampCartCount=()=>{
        const cart=leerCarrito();
        const total=cantidadTotal(cart);
        [document.getElementById("cart-count"),document.getElementById("mobile-cart-count")].forEach(el=>{
            if(el) el.textContent=total>99?"99+":String(total);
        });
    };
    clampCartCount();

    /* Devuelve el foco al control que abrió cada panel. */
    let previousFocus=null;
    const remember=(selector)=>document.querySelector(selector)?.addEventListener("click",()=>{previousFocus=document.activeElement;});
    remember("#cart-trigger");
    remember("#orders-trigger");
    remember(".mobile-dock-cart");
    remember(".mobile-dock-orders");

    const focusBack=()=>{
        if(previousFocus instanceof HTMLElement && document.contains(previousFocus)){
            window.setTimeout(()=>previousFocus.focus({preventScroll:true}),0);
        }
    };
    document.querySelector(".cart-close")?.addEventListener("click",focusBack);
    document.querySelector(".orders-close")?.addEventListener("click",focusBack);

    /* En móvil el toque sobre las tarjetas de proceso deja feedback visual breve. */
    document.querySelectorAll(".process-step,.feature").forEach(card=>{
        card.addEventListener("pointerdown",event=>{
            if(event.pointerType!=="touch") return;
            card.classList.add("touch-active");
            window.setTimeout(()=>card.classList.remove("touch-active"),520);
        },{passive:true});
    });
})();


/* Galería: swipe en móvil + flechas del teclado en desktop. */
(function configurarGaleriaAccesible(){
    const modal=document.getElementById("producto-dinamico");
    const imageStage=modal?.querySelector(".product-detail-image");
    if(!modal||!imageStage) return;

    let startX=null;
    imageStage.addEventListener("touchstart",event=>{
        startX=event.touches?.[0]?.clientX ?? null;
    },{passive:true});
    imageStage.addEventListener("touchend",event=>{
        if(startX===null) return;
        const endX=event.changedTouches?.[0]?.clientX ?? startX;
        const delta=endX-startX;
        startX=null;
        if(Math.abs(delta)<48) return;
        modal.querySelector(delta<0?".product-gallery-next":".product-gallery-prev")?.click();
    },{passive:true});

    document.addEventListener("keydown",event=>{
        if(!modal.classList.contains("active")) return;
        if(event.key==="ArrowRight") modal.querySelector(".product-gallery-next")?.click();
        if(event.key==="ArrowLeft") modal.querySelector(".product-gallery-prev")?.click();
    });
})();

/* Mantiene el foco dentro de overlays abiertos para navegación con teclado. */
(function configurarFocusTrap(){
    const containers=[
        document.getElementById("producto-dinamico"),
        document.getElementById("checkout-modal"),
        document.getElementById("cart-drawer"),
        document.getElementById("orders-drawer"),
        document.getElementById("payment-result"),
        document.getElementById("payment-confirm-overlay")
    ].filter(Boolean);

    const activeContainer=()=>containers.find(el=>el.classList.contains("active")&&el.getAttribute("aria-hidden")!=="true");
    document.addEventListener("keydown",event=>{
        if(event.key!=="Tab") return;
        const root=activeContainer();
        if(!root) return;
        const focusable=Array.from(root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
            .filter(el=>!el.hidden&&el.offsetParent!==null);
        if(!focusable.length) return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
})();


/* =========================================================
   DORADO — ESTADO COMERCIAL CASI FINAL
   - MP se habilita automáticamente cuando MERCADOPAGO_ENABLED=true.
   - Horario del local calculado en zona Buenos Aires.
   ========================================================= */
(function doradoEstadoComercial(){
  const run=async()=>{
    const payment=document.getElementById("checkout-payment-method");
    const mpOption=payment?.querySelector('option[value="mercadopago"]');
    const cardOption=payment?.querySelector('option[value="tarjeta"]');
    if(payment){
      try{
        const data=await obtenerConfigPublica();
        const mpEnabled=Boolean(data?.mercadoPagoEnabled);
        const cardEnabled=Boolean(data?.cardPaymentsEnabled);
        window.doradoPaymentAvailability={mercadoPago:mpEnabled,card:cardEnabled};
        if(mpOption)mpOption.textContent=mpEnabled?"Mercado Pago":"Mercado Pago — a activar";
        if(cardOption)cardOption.textContent=cardEnabled?"Tarjeta de débito / crédito":"Tarjeta de débito / crédito — falta Public Key";
        payment.dispatchEvent(new Event("change",{bubbles:true}));
      }catch{
        window.doradoPaymentAvailability={mercadoPago:false,card:false};
        if(mpOption)mpOption.textContent="Mercado Pago — a activar";
        if(cardOption)cardOption.textContent="Tarjeta de débito / crédito — a activar";
      }
    }

    const status=document.getElementById("store-open-status");
    if(status){
      try{
        const parts=new Intl.DateTimeFormat("en-US",{
          timeZone:"America/Argentina/Buenos_Aires",
          weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
        }).formatToParts(new Date());
        const get=type=>parts.find(p=>p.type===type)?.value||"";
        const dayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
        const day=dayMap[get("weekday")];
        const minutes=(Number(get("hour"))||0)*60+(Number(get("minute"))||0);
        const ranges={
          0:[],
          1:[[540,780],[960,1200]],
          2:[[540,780],[960,1200]],
          3:[[540,780],[960,1200]],
          4:[[540,780],[960,1200]],
          5:[[540,780],[960,1200]],
          6:[[540,1200]]
        };
        const open=(ranges[day]||[]).some(([from,to])=>minutes>=from&&minutes<to);
        status.textContent=open?"Local abierto":"Local cerrado";
        status.classList.toggle("is-open",open);
        status.classList.toggle("is-closed",!open);
      }catch{
        status.textContent="Local cerrado";
        status.classList.add("is-closed");
      }
    }
  };
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run,{once:true});
  else run();
})();


/* =========================================================
   DORADO — TARJETA DIRECTA CON MERCADO PAGO
   CardForm tokeniza PAN/CVV en el navegador. Dorado recibe sólo un token.
   ========================================================= */
(function configurarPagoTarjetaMercadoPago(){
    let sdkPromise=null;
    let cardForm=null;
    let initializing=false;

    const statusEl=()=>document.getElementById("mp-card-status");
    const setStatus=(text,type="")=>{
        const el=statusEl();
        if(!el)return;
        el.textContent=text;
        el.className=`mp-card-status ${type}`.trim();
    };

    const totalActual=()=>{
        const carrito=leerCarrito();
        const subtotal=Math.round(carrito.reduce((sum,item)=>{
            const qty=Math.max(1,Number(item.cantidad)||1);
            return sum+(Number(item.precio)||0)*qty;
        },0)*100)/100;
        if(checkoutCoupon&&Math.abs(Number(checkoutCoupon.subtotal||0)-subtotal)<0.01){
            return Math.max(0,Number(checkoutCoupon.total)||subtotal);
        }
        return subtotal;
    };

    const loadSdk=()=>{
        if(window.MercadoPago)return Promise.resolve(window.MercadoPago);
        if(sdkPromise)return sdkPromise;
        sdkPromise=new Promise((resolve,reject)=>{
            const existing=document.querySelector('script[data-mercadopago-sdk="true"]');
            if(existing){
                if(window.MercadoPago){
                    resolve(window.MercadoPago);
                    return;
                }
                const timeout=window.setTimeout(()=>{
                    if(window.MercadoPago)resolve(window.MercadoPago);
                    else reject(new Error("Mercado Pago no terminó de cargar. Recargá la página."));
                },5000);
                existing.addEventListener("load",()=>{
                    window.clearTimeout(timeout);
                    if(window.MercadoPago)resolve(window.MercadoPago);
                    else reject(new Error("Mercado Pago no inició correctamente."));
                },{once:true});
                existing.addEventListener("error",()=>{
                    window.clearTimeout(timeout);
                    reject(new Error("No se pudo cargar Mercado Pago."));
                },{once:true});
                return;
            }
            const script=document.createElement("script");
            script.src="https://sdk.mercadopago.com/js/v2";
            script.async=true;
            script.dataset.mercadopagoSdk="true";
            script.onload=()=>window.MercadoPago?resolve(window.MercadoPago):reject(new Error("Mercado Pago no inició correctamente."));
            script.onerror=()=>reject(new Error("No se pudo cargar Mercado Pago."));
            document.head.appendChild(script);
        }).catch(error=>{
            sdkPromise=null;
            throw error;
        });
        return sdkPromise;
    };

    const rejectedMessage=detail=>{
        const messages={
            cc_rejected_insufficient_amount:"La tarjeta no tiene saldo o límite disponible suficiente.",
            cc_rejected_bad_filled_card_number:"Revisá el número de la tarjeta.",
            cc_rejected_bad_filled_date:"Revisá la fecha de vencimiento.",
            cc_rejected_bad_filled_security_code:"Revisá el código de seguridad.",
            cc_rejected_call_for_authorize:"El banco necesita que autorices el pago. Comunicate con la entidad emisora.",
            cc_rejected_card_disabled:"La tarjeta está deshabilitada. Comunicate con la entidad emisora.",
            cc_rejected_duplicated_payment:"Ese pago ya fue intentado. Esperá unos minutos antes de volver a probar.",
            cc_rejected_high_risk:"Mercado Pago rechazó la operación por seguridad. Probá otro medio de pago.",
            cc_rejected_other_reason:"La tarjeta fue rechazada. Probá otra tarjeta o medio de pago."
        };
        return messages[String(detail||"").toLowerCase()]||"La tarjeta fue rechazada. Revisá los datos o probá otra tarjeta.";
    };

    const uuid=()=>{
        if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,char=>{
            const r=Math.random()*16|0;
            const v=char==="x"?r:(r&0x3|0x8);
            return v.toString(16);
        });
    };

    const procesar=async formData=>{
        const form=document.getElementById("checkout-form");
        const button=document.getElementById("checkout-pay");
        if(!form||!button)return;

        mostrarErrorCheckout("");
        if(!form.reportValidity()){
            throw new Error("Completá tus datos de contacto y entrega antes de pagar.");
        }

        const carrito=leerCarrito();
        if(!carrito.length)throw new Error("Tu carrito está vacío.");

        const datos=new FormData(form);
        if(String(datos.get("metodo_pago")||"")!=="tarjeta")return;

        const token=String(formData?.token||"").trim();
        const paymentMethodId=String(formData?.paymentMethodId||"").trim();
        const identificationType=String(formData?.identificationType||"").trim();
        const identificationNumber=String(formData?.identificationNumber||"").trim();

        if(!token||!paymentMethodId||!identificationType||!identificationNumber){
            throw new Error("Revisá los datos de la tarjeta y del titular.");
        }

        const entrega=String(datos.get("entrega")||"retiro").trim();
        const cliente={
            nombre:String(datos.get("nombre")||"").trim(),
            email:String(datos.get("email")||"").trim(),
            telefono:String(datos.get("telefono")||"").trim(),
            domicilio:String(datos.get("domicilio")||"").trim(),
            ciudad:String(datos.get("ciudad")||"").trim(),
            provincia:String(datos.get("provincia")||"").trim(),
            codigo_postal:String(datos.get("codigo_postal")||"").trim(),
            entrega,
            notas:String(datos.get("notas")||"").trim()
        };
        const items=carrito.map(item=>({
            id:item.id,
            cantidad:Math.max(1,Math.floor(Number(item.cantidad)||1))
        }));

        const original=button.innerHTML;
        button.disabled=true;
        button.innerHTML="<span>Procesando tarjeta…</span>";
        setStatus("Procesando el pago de forma segura…","loading");

        try{
            const response=await fetch("/api/checkout",{
                method:"POST",
                headers:{"Content-Type":"application/json","Accept":"application/json"},
                body:JSON.stringify({
                    cliente,
                    items,
                    payment_method:"tarjeta",
                    payment_attempt_id:uuid(),
                    cupon:String(document.getElementById("checkout-coupon-code")?.value||"").trim().toUpperCase(),
                    card_payment:{
                        token,
                        payment_method_id:paymentMethodId,
                        issuer_id:String(formData?.issuerId||""),
                        installments:Math.max(1,Number(formData?.installments)||1),
                        identification_type:identificationType,
                        identification_number:identificationNumber
                    }
                })
            });

            const result=await response.json().catch(()=>({}));
            if(!response.ok)throw new Error(result?.error||"No pudimos procesar la tarjeta.");

            const orderId=String(result?.order_id||"");
            const tracking=String(result?.tracking_token||"");
            const paymentStatus=String(result?.payment_status||"").toLowerCase();
            const detail=String(result?.payment_status_detail||"").toLowerCase();

            if(orderId&&tracking)guardarReferenciaPedido(orderId,tracking);
            if(orderId)sessionStorage.setItem("doradoUltimoPedido",orderId);

            if(paymentStatus==="approved"){
                setStatus("Pago aprobado. Confirmando tu pedido…","ok");
                window.location.assign(`/gracias.html?order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(tracking)}`);
                return;
            }

            if(paymentStatus==="review"){
                setStatus("Pago recibido. El pedido quedó en revisión.","warning");
                window.location.assign(`/?checkout=pending&order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(tracking)}`);
                return;
            }

            if(["pending","in_process"].includes(paymentStatus)){
                setStatus("Mercado Pago está procesando la operación.","warning");
                window.location.assign(`/?checkout=pending&order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(tracking)}`);
                return;
            }

            if(["rejected","cancelled"].includes(paymentStatus)){
                const message=paymentStatus==="rejected"
                    ? rejectedMessage(detail)
                    : "El pago fue cancelado. Podés volver a intentarlo.";
                setStatus(message,"error");
                mostrarErrorCheckout(message);
                return;
            }

            setStatus("Mercado Pago está verificando la operación.","warning");
            window.location.assign(`/?checkout=pending&order=${encodeURIComponent(orderId)}&tracking=${encodeURIComponent(tracking)}`);
        }finally{
            button.disabled=false;
            button.innerHTML=original;
        }
    };

    const init=async()=>{
        if(cardForm||initializing)return;
        initializing=true;
        window.__doradoCardFormReady=false;
        setStatus("Preparando campos seguros de Mercado Pago…","loading");

        try{
            const config=await obtenerConfigPublica();
            const publicKey=String(config?.mercadoPagoPublicKey||"").trim();
            if(!config?.cardPaymentsEnabled||!publicKey){
                setStatus("Falta configurar la Public Key de Mercado Pago.","error");
                return;
            }

            const MercadoPagoCtor=await loadSdk();
            const mp=new MercadoPagoCtor(publicKey,{locale:"es-AR"});
            const amount=totalActual();
            if(!(amount>0))throw new Error("El total del pedido no es válido.");

            cardForm=mp.cardForm({
                amount:String(amount),
                iframe:true,
                form:{
                    id:"checkout-form",
                    cardNumber:{id:"mp-card-number",placeholder:"Número de tarjeta"},
                    expirationDate:{id:"mp-expiration-date",placeholder:"MM/AA"},
                    securityCode:{id:"mp-security-code",placeholder:"CVV"},
                    cardholderName:{id:"mp-cardholder-name",placeholder:"Nombre como figura en la tarjeta"},
                    issuer:{id:"mp-issuer",placeholder:"Banco emisor"},
                    installments:{id:"mp-installments",placeholder:"Cuotas"},
                    identificationType:{id:"mp-identification-type",placeholder:"Tipo de documento"},
                    identificationNumber:{id:"mp-identification-number",placeholder:"Número de documento"},
                    cardholderEmail:{id:"checkout-email",placeholder:"Email"}
                },
                callbacks:{
                    onFormMounted:error=>{
                        if(error){
                            console.error("Mercado Pago CardForm mount error");
                            cardForm=null;
                            window.__doradoCardFormReady=false;
                            setStatus("No pudimos iniciar los campos seguros. Tocá Tarjeta nuevamente para reintentar.","error");
                            return;
                        }

                        window.setTimeout(()=>{
                            const mounted=[
                                "mp-card-number",
                                "mp-expiration-date",
                                "mp-security-code"
                            ].every(id=>document.getElementById(id)?.querySelector("iframe"));

                            if(!mounted){
                                console.error("Mercado Pago secure fields were not mounted");
                                cardForm=null;
                                window.__doradoCardFormReady=false;
                                setStatus("Los campos seguros no terminaron de cargar. Volvé a elegir Tarjeta para reintentar.","error");
                                return;
                            }

                            window.__doradoCardFormReady=true;
                            window.__doradoRefreshMpSelects?.();
                            setStatus("Campos seguros listos para pagar.","ok");
                        },250);
                    },
                    onSubmit:async event=>{
                        event.preventDefault();
                        const payment=document.getElementById("checkout-payment-method");
                        if(String(payment?.value||"")!=="tarjeta")return;
                        try{
                            await procesar(cardForm.getCardFormData());
                        }catch(error){
                            console.error("Card payment error:",error);
                            const message=error?.message||"No pudimos procesar la tarjeta.";
                            setStatus(message,"error");
                            mostrarErrorCheckout(message);
                        }
                    },
                    onFetching:()=>{
                        setStatus("Consultando Mercado Pago…","loading");
                        return ()=>{ if(window.__doradoCardFormReady)setStatus("Campos seguros listos para pagar.","ok"); };
                    }
                }
            });
        }catch(error){
            console.error("Mercado Pago card initialization error:",error);
            setStatus(error?.message||"No pudimos iniciar el pago con tarjeta.","error");
        }finally{
            initializing=false;
        }
    };

    window.__doradoInitCardPayment=init;
})();

/* DORADO — selects visuales de Mercado Pago (documento / issuer / installments) */
(function configurarSelectoresMercadoPago(){
    const ids=["mp-identification-type","mp-issuer","mp-installments"];
    const wrappers=new Map();

    const createFor=select=>{
        if(!select||wrappers.has(select))return;

        select.classList.add("mp-native-select");

        const wrapper=document.createElement("div");
        wrapper.className="mp-visual-select";

        const trigger=document.createElement("button");
        trigger.type="button";
        trigger.className="mp-visual-select-trigger";
        trigger.setAttribute("aria-haspopup","listbox");
        trigger.setAttribute("aria-expanded","false");

        const value=document.createElement("span");
        value.className="mp-visual-select-value";

        const chevron=document.createElementNS("http://www.w3.org/2000/svg","svg");
        chevron.setAttribute("viewBox","0 0 20 20");
        chevron.setAttribute("aria-hidden","true");
        chevron.classList.add("mp-visual-select-chevron");
        chevron.innerHTML='<path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

        const menu=document.createElement("div");
        menu.className="mp-visual-select-menu";
        menu.setAttribute("role","listbox");
        menu.hidden=true;

        trigger.append(value,chevron);
        select.insertAdjacentElement("afterend",wrapper);
        wrapper.append(trigger,menu);

        const close=()=>{
            wrapper.classList.remove("is-open");
            menu.hidden=true;
            trigger.setAttribute("aria-expanded","false");
        };

        const rebuild=()=>{
            const options=Array.from(select.options);
            const current=select.options[select.selectedIndex];
            const fallback={
                "mp-identification-type":"Tipo de documento",
                "mp-issuer":"Banco emisor",
                "mp-installments":"Cuotas"
            };
            value.textContent=current?.textContent?.trim()||fallback[select.id]||"Elegí una opción";

            menu.innerHTML="";
            options.forEach(option=>{
                const button=document.createElement("button");
                button.type="button";
                button.className="mp-visual-select-option";
                button.textContent=option.textContent?.trim()||"";
                button.disabled=option.disabled||!String(option.value||"").trim();
                button.classList.toggle("is-selected",option.value===select.value);
                button.setAttribute("role","option");
                button.setAttribute("aria-selected",option.value===select.value?"true":"false");
                button.addEventListener("click",()=>{
                    if(button.disabled)return;
                    select.value=option.value;
                    select.dispatchEvent(new Event("change",{bubbles:true}));
                    rebuild();
                    close();
                    trigger.focus({preventScroll:true});
                });
                menu.appendChild(button);
            });

            trigger.disabled=options.filter(option=>String(option.value||"").trim()).length===0;
        };

        trigger.addEventListener("click",()=>{
            if(trigger.disabled)return;
            const opening=menu.hidden;
            document.querySelectorAll(".mp-visual-select.is-open").forEach(other=>{
                if(other===wrapper)return;
                other.classList.remove("is-open");
                const otherMenu=other.querySelector(".mp-visual-select-menu");
                const otherTrigger=other.querySelector(".mp-visual-select-trigger");
                if(otherMenu)otherMenu.hidden=true;
                otherTrigger?.setAttribute("aria-expanded","false");
            });
            menu.hidden=!opening;
            wrapper.classList.toggle("is-open",opening);
            trigger.setAttribute("aria-expanded",String(opening));
        });

        select.addEventListener("change",rebuild);

        const observer=new MutationObserver(rebuild);
        observer.observe(select,{childList:true,subtree:true,attributes:true});

        wrappers.set(select,{wrapper,rebuild,observer});
        rebuild();
    };

    const init=()=>ids.forEach(id=>createFor(document.getElementById(id)));
    init();

    document.addEventListener("click",event=>{
        if(event.target.closest?.(".mp-visual-select"))return;
        document.querySelectorAll(".mp-visual-select.is-open").forEach(wrapper=>{
            wrapper.classList.remove("is-open");
            const menu=wrapper.querySelector(".mp-visual-select-menu");
            const trigger=wrapper.querySelector(".mp-visual-select-trigger");
            if(menu)menu.hidden=true;
            trigger?.setAttribute("aria-expanded","false");
        });
    });

    window.__doradoRefreshMpSelects=()=>{
        wrappers.forEach(entry=>entry.rebuild());
    };
})();

(function configurarEstadoNuevosPagos(){
  const run=async()=>{
    const mpStates=Array.from(document.querySelectorAll('[data-payment-status="mp"]'));
    const cardStates=Array.from(document.querySelectorAll('[data-payment-status="card"]'));
    if(!mpStates.length&&!cardStates.length)return;
    try{
      const data=await obtenerConfigPublica();
      const mpEnabled=Boolean(data?.mercadoPagoEnabled);
      const cardEnabled=Boolean(data?.cardPaymentsEnabled);
      mpStates.forEach(el=>{el.textContent=mpEnabled?"Disponible":"A activar";el.classList.toggle("ready",mpEnabled);});
      cardStates.forEach(el=>{el.textContent=cardEnabled?"Disponible":"A activar";el.classList.toggle("ready",cardEnabled);});
    }catch{
      [...mpStates,...cardStates].forEach(el=>{el.textContent="A activar";el.classList.remove("ready");});
    }
  };
  run();
})();

(function configurarResenasReales(){
    const marquee=document.getElementById("reviews-marquee-shell");
    const track=document.getElementById("reviews-marquee-track");
    const filterButton=document.getElementById("reviews-filter-toggle");
    const filterPanel=document.getElementById("reviews-filter-panel");
    const ratingFilter=document.getElementById("reviews-rating-filter");
    const grid=document.getElementById("reviews-grid");
    const ratingSummary=document.getElementById("reviews-rating-summary");
    const googleLink=document.querySelector(".reviews-google-link");
    if(!marquee||!track||!filterButton||!filterPanel||!ratingFilter||!grid)return;

    let reviews=[];
    const stars=rating=>"★".repeat(Math.max(1,Math.min(5,Number(rating)||1)))+"☆".repeat(Math.max(0,5-(Number(rating)||1)));
    const safePhoto=url=>{try{const parsed=new URL(String(url||""));return parsed.protocol==="https:"?parsed.toString():"";}catch{return "";}};
    const dateLabel=review=>{const literal=String(review?.fecha_texto||"").trim();if(literal)return literal;const date=new Date(review?.fecha_resena||"");return Number.isFinite(date.getTime())?date.toLocaleDateString("es-AR",{year:"numeric",month:"short"}):"";};
    const cardMarkup=review=>{
        const photo=safePhoto(review.avatar_url);
        const initial=textoSeguro(String(review.autor||"Cliente").trim().charAt(0).toUpperCase()||"C");
        const author=textoSeguro(review.autor||"Cliente");
        return `<article class="review-card">
          <div class="review-card-top">
            <span class="review-avatar">
              <span class="review-avatar-initial" aria-hidden="true">${initial}</span>
              ${photo?`<img src="${textoSeguro(photo)}" alt="Foto de perfil de ${author}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:""}
            </span>
            <span class="review-author">
              <span class="review-author-line">
                <strong>${author}</strong>
                <img class="review-verified-badge" src="assets/icons/review-verified-blue.svg" alt="" aria-hidden="true" loading="lazy" decoding="async">
              </span>
              <small>${textoSeguro(dateLabel(review))}</small>
            </span>
            <img class="review-google-logo" src="assets/icons/google-g.svg" alt="Google" loading="lazy" decoding="async">
          </div>
          <div class="review-stars" aria-label="${Number(review.calificacion)||0} de 5 estrellas">${stars(review.calificacion)}</div>
          <p>${textoSeguro(review.comentario||"Sin comentario escrito.")}</p>
        </article>`;
    };
    const wireAvatarFallbacks=root=>{
        root?.querySelectorAll(".review-avatar img").forEach(img=>{
            img.addEventListener("error",()=>img.remove(),{once:true});
        });
    };
    const renderMarquee=()=>{
        const best=reviews.filter(review=>Number(review.calificacion)>=4&&String(review.comentario||"").trim()).slice(0,5);
        if(!best.length){marquee.hidden=true;return;}
        marquee.hidden=false;
        const set=best.map(cardMarkup).join("");
        track.innerHTML=`<div class="reviews-marquee-set">${set}</div><div class="reviews-marquee-set" aria-hidden="true">${set}</div>`;
        wireAvatarFallbacks(track);
    };
    const renderFilter=()=>{
        const value=ratingFilter.value;
        const filtered=reviews.filter(review=>{
            const rating=Number(review.calificacion)||0;
            if(value==="5")return rating===5;
            if(value==="4")return rating>=4;
            if(value==="low")return rating<=3;
            return true;
        });
        grid.innerHTML=filtered.length?filtered.map(cardMarkup).join(""):'<div class="reviews-filter-empty">No hay reseñas para este filtro.</div>';
        wireAvatarFallbacks(grid);
    };
    filterButton.addEventListener("click",()=>{
        const opening=filterPanel.hidden;
        filterPanel.hidden=!opening;
        filterButton.setAttribute("aria-expanded",String(opening));
        filterButton.textContent=opening?"CERRAR FILTRO":"FILTRAR RESEÑAS";
        if(opening)renderFilter();
    });
    ratingFilter.addEventListener("change",renderFilter);

    const cargarResenas=async()=>{
        try{
            const response=await fetch("/api/reviews",{headers:{Accept:"application/json"},cache:"default"});
            const data=await response.json().catch(()=>({}));
            reviews=Array.isArray(data.reviews)?data.reviews:[];
            if(googleLink&&data?.maps_url)googleLink.href=String(data.maps_url);
            if(ratingSummary){
                const total=Number(data?.summary?.total)||reviews.length;
                const average=Number(data?.summary?.average);
                ratingSummary.textContent=total&&Number.isFinite(average)
                    ? `${average.toLocaleString("es-AR",{minimumFractionDigits:1,maximumFractionDigits:1})} · ${total} opiniones en Google`
                    : "";
                ratingSummary.hidden=!total;
            }
        }catch{
            reviews=[];
            if(ratingSummary)ratingSummary.hidden=true;
        }

        const section=document.getElementById("opiniones");
        const hasReviews=reviews.length>0;

        if(section){
            section.hidden=!hasReviews;
            section.classList.toggle("is-empty",!hasReviews);
        }

        filterButton.hidden=!hasReviews;
        if(!hasReviews){
            marquee.hidden=true;
            filterPanel.hidden=true;
            filterButton.setAttribute("aria-expanded","false");
            return;
        }

        renderMarquee();
    };

    const reviewSection=document.getElementById("opiniones");
    let reviewsStarted=false;
    const startReviews=()=>{
        if(reviewsStarted)return;
        reviewsStarted=true;
        ejecutarCuandoHayaTiempo(cargarResenas,DORADO_DEVICE_PROFILE.low?900:300);
    };

    if(reviewSection&&"IntersectionObserver" in window){
        const reviewsObserver=new IntersectionObserver(entries=>{
            if(entries.some(entry=>entry.isIntersecting)){
                reviewsObserver.disconnect();
                startReviews();
            }
        },{rootMargin:"700px 0px 700px 0px",threshold:0});
        reviewsObserver.observe(reviewSection);
    }else{
        startReviews();
    }
})();

/* DORADO — selectores visuales de provincia y entrega */
(function configurarSelectoresCheckout(){
    const configs=[
        {
            id:"checkout-province",
            placeholder:"Elegí una provincia",
            menuLabel:"Provincia",
            helper:()=>"",
            badge:()=>""
        },
        {
            id:"checkout-delivery",
            placeholder:"Elegí cómo recibir tu pedido",
            menuLabel:"Entrega",
            helper:(value)=>{
                if(value==="retiro")return "Retirás tu pedido en el local.";
                if(value==="local")return "Entrega local o en cercanías.";
                if(value==="nacional")return "Envío al resto de Argentina.";
                if(value==="coordinar")return "Coordinación directa por WhatsApp.";
                return "";
            },
            badge:(value)=>{
                if(value==="retiro")return "LOCAL";
                if(value==="local")return "CERCANÍAS";
                if(value==="nacional")return "ARGENTINA";
                if(value==="coordinar")return "WHATSAPP";
                return "";
            }
        }
    ];

    const closeAll=(except=null)=>{
        document.querySelectorAll(".dorado-select.is-open").forEach(wrapper=>{
            if(wrapper===except)return;
            wrapper.classList.remove("is-open");
            const menu=wrapper.querySelector(".dorado-select-menu");
            const trigger=wrapper.querySelector(".dorado-select-trigger");
            if(menu)menu.hidden=true;
            if(trigger)trigger.setAttribute("aria-expanded","false");
        });
    };

    configs.forEach(config=>{
        const select=document.getElementById(config.id);
        if(!select||select.dataset.doradoSelect==="true")return;

        select.dataset.doradoSelect="true";
        select.classList.add("dorado-native-select");

        const wrapper=document.createElement("div");
        wrapper.className="dorado-select";
        wrapper.dataset.for=config.id;

        const trigger=document.createElement("button");
        trigger.type="button";
        trigger.className="dorado-select-trigger";
        trigger.id=`${config.id}-trigger`;
        trigger.setAttribute("aria-haspopup","listbox");
        trigger.setAttribute("aria-expanded","false");

        const triggerCopy=document.createElement("span");
        triggerCopy.className="dorado-select-trigger-copy";

        const triggerKicker=document.createElement("span");
        triggerKicker.className="dorado-select-kicker";
        triggerKicker.textContent=config.menuLabel.toUpperCase();

        const triggerValue=document.createElement("strong");
        triggerValue.className="dorado-select-value";

        triggerCopy.append(triggerKicker,triggerValue);

        const chevron=document.createElement("svg");
        chevron.className="ui-icon dorado-select-chevron";
        chevron.setAttribute("aria-hidden","true");
        chevron.innerHTML='<use href="#i-chevron"></use>';

        trigger.append(triggerCopy,chevron);

        const menu=document.createElement("div");
        menu.className="dorado-select-menu";
        menu.setAttribute("role","listbox");
        menu.setAttribute("aria-label",config.menuLabel);
        menu.hidden=true;

        const options=Array.from(select.options);

        const currentLabel=()=>{
            const option=options.find(item=>item.value===select.value) || select.options[select.selectedIndex];
            const text=String(option?.textContent||"").trim();
            return text && option?.value ? text : config.placeholder;
        };

        const render=()=>{
            triggerValue.textContent=currentLabel();
            trigger.classList.toggle("has-value",Boolean(select.value));
            menu.innerHTML="";

            options.forEach(option=>{
                if(!option.value)return;

                const button=document.createElement("button");
                button.type="button";
                button.className="dorado-select-option";
                button.dataset.value=option.value;
                button.setAttribute("role","option");
                button.setAttribute("aria-selected",option.value===select.value?"true":"false");
                if(option.value===select.value)button.classList.add("is-selected");

                const copy=document.createElement("span");
                copy.className="dorado-select-option-copy";

                const title=document.createElement("strong");
                title.textContent=String(option.textContent||"").trim();
                copy.appendChild(title);

                const helperText=String(config.helper(option.value,title.textContent)||"").trim();
                if(helperText){
                    const helper=document.createElement("small");
                    helper.textContent=helperText;
                    copy.appendChild(helper);
                }

                const badgeText=String(config.badge(option.value)||"").trim();
                if(badgeText){
                    const badge=document.createElement("span");
                    badge.className="dorado-select-badge";
                    badge.textContent=badgeText;
                    button.append(copy,badge);
                }else{
                    const check=document.createElement("span");
                    check.className="dorado-select-check";
                    check.textContent=option.value===select.value?"✓":"";
                    button.append(copy,check);
                }

                button.addEventListener("click",()=>{
                    select.value=option.value;
                    select.dispatchEvent(new Event("change",{bubbles:true}));
                    render();
                    closeAll();
                    trigger.focus({preventScroll:true});
                });

                menu.appendChild(button);
            });
        };

        trigger.addEventListener("click",()=>{
            const opening=menu.hidden;
            closeAll(wrapper);
            menu.hidden=!opening;
            wrapper.classList.toggle("is-open",opening);
            trigger.setAttribute("aria-expanded",opening?"true":"false");
        });

        select.addEventListener("change",render);

        wrapper.append(trigger,menu);
        select.insertAdjacentElement("afterend",wrapper);

        const label=select.closest(".checkout-field")?.querySelector(`label[for="${config.id}"]`);
        if(label)label.setAttribute("for",trigger.id);

        render();
    });

    document.addEventListener("click",event=>{
        if(!event.target.closest(".dorado-select"))closeAll();
    });

    document.addEventListener("keydown",event=>{
        if(event.key==="Escape"){
            const open=document.querySelector(".dorado-select.is-open");
            closeAll();
            open?.querySelector(".dorado-select-trigger")?.focus({preventScroll:true});
        }
    });
})();
/* FIN DORADO — selectores visuales de provincia y entrega */


/* =========================================================
   DORADO — PERFORMANCE MANAGER
   Pausa animaciones permanentes fuera de pantalla sin quitar
   ningún efecto cuando el usuario está viendo esa sección.
   ========================================================= */
(function configurarPerformanceManager(){
    const zones=[
        document.querySelector(".hero-combined-scene"),
        document.getElementById("nosotros"),
        document.getElementById("productos"),
        document.getElementById("mas-elegidos"),
        document.getElementById("como-comprar"),
        document.getElementById("opiniones"),
        document.getElementById("preguntas-frecuentes"),
        document.getElementById("contacto"),
        document.querySelector(".site-footer")
    ].filter(Boolean);

    if(!zones.length)return;

    zones.forEach(zone=>{
        zone.dataset.perfZone="true";
        zone.classList.add("perf-paused");
    });

    const activate=(zone,active)=>{
        zone.classList.toggle("perf-active",active);
        zone.classList.toggle("perf-paused",!active);
    };

    if("IntersectionObserver" in window){
        const observer=new IntersectionObserver(entries=>{
            entries.forEach(entry=>activate(entry.target,entry.isIntersecting));
        },{
            rootMargin:"160px 0px 160px 0px",
            threshold:0
        });
        zones.forEach(zone=>observer.observe(zone));
    }else{
        zones.forEach(zone=>activate(zone,true));
    }

    const syncVisibility=()=>{
        document.documentElement.classList.toggle("perf-page-hidden",document.hidden);
    };
    document.addEventListener("visibilitychange",syncVisibility,{passive:true});
    syncVisibility();
})();


/* =========================================================
   DORADO — FLUID INPUT & DRAWER GESTURES V3
   Vanilla JS, sin dependencias. Mantiene el comportamiento existente y
   suma feedback inmediato + swipe-to-dismiss físico en touch.
   ========================================================= */
(function configurarEntradaFluidaDorado(){
    const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobileViewport=window.matchMedia("(max-width: 980px)");

    /* Feedback desde pointer-down: la respuesta visual no espera al click. */
    const pressSelector=[
        ".gold-btn", ".outline-btn", ".hero-btn", ".hero-secondary", ".nav-cta",
        ".cart-trigger", ".orders-trigger", ".menu-toggle", ".view-product",
        ".add-card-product", ".dynamic-add-cart", ".dynamic-add-cart-mobile",
        ".cart-checkout", ".checkout-pay", ".checkout-wholesale",
        ".reviews-filter-button", ".reviews-google-link", ".catalog-retry-btn",
        ".map-open-button", ".category-chip", ".mobile-dock-item",
        ".cart-close", ".orders-close", ".checkout-close", ".product-detail-close"
    ].join(",");

    let pressed=null;
    const releasePress=()=>{
        pressed?.classList.remove("is-pressing");
        pressed=null;
    };

    document.addEventListener("pointerdown",event=>{
        const target=event.target.closest?.(pressSelector);
        if(!target||target.matches(":disabled")||target.getAttribute("aria-disabled")==="true")return;
        releasePress();
        pressed=target;
        target.classList.add("is-pressing");
    },{passive:true});

    document.addEventListener("pointerup",releasePress,{passive:true});
    document.addEventListener("pointercancel",releasePress,{passive:true});
    window.addEventListener("blur",releasePress,{passive:true});

    const project=(velocity,decelerationRate=.998)=>
        (velocity/1000)*decelerationRate/(1-decelerationRate);

    const rubberband=(overshoot,dimension,constant=.22)=>
        (overshoot*dimension*constant)/(dimension+constant*Math.abs(overshoot));

    function enableSwipeDismiss({drawerId,handleSelector,overlayId,close}){
        const drawer=document.getElementById(drawerId);
        const handle=drawer?.querySelector(handleSelector);
        const overlay=document.getElementById(overlayId);
        if(!drawer||!handle||!overlay||typeof close!=="function"||!("PointerEvent" in window))return;

        let pointerId=null;
        let startX=0;
        let startY=0;
        let width=1;
        let currentX=0;
        let tracking=false;
        let dragging=false;
        let samples=[];
        let resetTimer=0;

        const clearInlineState=()=>{
            window.clearTimeout(resetTimer);
            drawer.style.removeProperty("--drawer-drag-x");
            overlay.style.removeProperty("opacity");
        };

        const sample=(x,time)=>{
            samples.push({x,time});
            const cutoff=time-90;
            while(samples.length>2&&samples[0].time<cutoff)samples.shift();
        };

        const velocity=()=>{
            if(samples.length<2)return 0;
            const a=samples[0];
            const b=samples[samples.length-1];
            const dt=Math.max(1,b.time-a.time);
            return ((b.x-a.x)/dt)*1000;
        };

        const finish=event=>{
            if(!tracking||event.pointerId!==pointerId)return;
            tracking=false;

            try{if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);}catch{}

            if(!dragging){
                pointerId=null;
                samples=[];
                return;
            }

            const v=velocity();
            const projected=currentX+project(v);
            const shouldClose=currentX>width*.30||projected>width*.46||v>720;

            drawer.classList.remove("is-dragging");
            overlay.style.removeProperty("opacity");

            if(shouldClose){
                close();
                resetTimer=window.setTimeout(clearInlineState,460);
            }else{
                drawer.style.setProperty("--drawer-drag-x","0px");
                resetTimer=window.setTimeout(clearInlineState,460);
            }

            pointerId=null;
            samples=[];
            currentX=0;
            dragging=false;
        };

        handle.addEventListener("pointerdown",event=>{
            const isTouchLike=event.pointerType==="touch"||event.pointerType==="pen"||mobileViewport.matches;
            if(!isTouchLike||reduceMotion.matches||event.button!==0||!drawer.classList.contains("active"))return;
            if(event.target.closest("button,a,input,select,textarea,[role='button']"))return;

            clearInlineState();
            pointerId=event.pointerId;
            startX=event.clientX;
            startY=event.clientY;
            width=Math.max(1,drawer.getBoundingClientRect().width);
            currentX=0;
            tracking=true;
            dragging=false;
            samples=[];
            sample(0,event.timeStamp||performance.now());

            try{handle.setPointerCapture(pointerId);}catch{}
        },{passive:true});

        handle.addEventListener("pointermove",event=>{
            if(!tracking||event.pointerId!==pointerId)return;

            const dx=event.clientX-startX;
            const dy=event.clientY-startY;

            if(!dragging){
                if(Math.hypot(dx,dy)<10)return;
                if(Math.abs(dy)>=Math.abs(dx)){
                    tracking=false;
                    try{if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId);}catch{}
                    pointerId=null;
                    samples=[];
                    return;
                }
                dragging=true;
                drawer.classList.add("is-dragging");
            }

            event.preventDefault();
            currentX=dx>=0?dx:-rubberband(-dx,width);
            drawer.style.setProperty("--drawer-drag-x",`${currentX.toFixed(2)}px`);

            const progress=Math.min(1,Math.max(0,currentX/width));
            overlay.style.opacity=String(Math.max(.08,1-progress*.92));
            sample(currentX,event.timeStamp||performance.now());
        },{passive:false});

        handle.addEventListener("pointerup",finish,{passive:true});
        handle.addEventListener("pointercancel",finish,{passive:true});

        /* Si el drawer se cierra por otro camino, no dejamos estado gestual. */
        drawer.addEventListener("transitionend",event=>{
            if(event.propertyName!=="transform"||drawer.classList.contains("active"))return;
            clearInlineState();
            drawer.classList.remove("is-dragging");
        });
    }

    enableSwipeDismiss({
        drawerId:"cart-drawer",
        handleSelector:".cart-head",
        overlayId:"cart-overlay",
        close:cerrarCarrito
    });

    enableSwipeDismiss({
        drawerId:"orders-drawer",
        handleSelector:".orders-head",
        overlayId:"orders-overlay",
        close:cerrarMisPedidos
    });
})();

window.addEventListener("resize",()=>{
  if(window.innerWidth<=900)syncCategoryLiquidIndicator({animate:false});
},{passive:true});
