const DORADO_CART_KEY = "doradoCarrito";
const DORADO_ORDERS_KEY = "doradoMisPedidos";
const DORADO_WHATSAPP = "5491168070039";

const catalogoProductos = new Map();
let productoModalActual = null;

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
        "logo-2.PNG": "assets/images/brand/logo-dorado.png",
        "/logo-2.PNG": "assets/images/brand/logo-dorado.png",
        "logo.PNG": "assets/images/brand/logo-dorado.png",
        "/logo.PNG": "assets/images/brand/logo-dorado.png",
        "logo.jpg": "assets/images/brand/logo-dorado.png",
        "/logo.jpg": "assets/images/brand/logo-dorado.png",
        "auriculares 2.PNG": "assets/images/brand/logo-dorado.png",
        "/auriculares 2.PNG": "assets/images/brand/logo-dorado.png",
        "hero-bg-dorado-art-pesca.png": "assets/images/backgrounds/hero-bg-dorado-art-pesca.webp",
        "/hero-bg-dorado-art-pesca.png": "assets/images/backgrounds/hero-bg-dorado-art-pesca.webp",
        "sobre-nosotros-bg.png": "assets/images/backgrounds/sobre-nosotros-bg.webp",
        "/sobre-nosotros-bg.png": "assets/images/backgrounds/sobre-nosotros-bg.webp",
        "assets/images/backgrounds/hero-bg-dorado-art-pesca.png": "assets/images/backgrounds/hero-bg-dorado-art-pesca.webp",
        "/assets/images/backgrounds/hero-bg-dorado-art-pesca.png": "assets/images/backgrounds/hero-bg-dorado-art-pesca.webp",
        "assets/images/backgrounds/sobre-nosotros-bg.png": "assets/images/backgrounds/sobre-nosotros-bg.webp",
        "/assets/images/backgrounds/sobre-nosotros-bg.png": "assets/images/backgrounds/sobre-nosotros-bg.webp",
        "assets/images/brand/logo-dorado.png": "assets/images/brand/logo-dorado.png",
        "/assets/images/brand/logo-dorado.png": "assets/images/brand/logo-dorado.png",
        "assets/images/products/auriculares-2.png": "assets/images/brand/logo-dorado.png",
        "/assets/images/products/auriculares-2.png": "assets/images/brand/logo-dorado.png"
    };

    if (!imagen) return "assets/images/brand/logo-dorado.png";
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

    return "assets/images/brand/logo-dorado.png";
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

async function cargarProductosDesdeSupabase() {
    const contenedor = document.getElementById("products-grid");

    if (!contenedor) return;

    try {
        const respuesta = await fetch("/api/products", {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!respuesta.ok) {
            throw new Error("No se pudieron cargar los productos");
        }

        const productos = await respuesta.json();

        if (!Array.isArray(productos)) {
            throw new Error("Respuesta de productos inválida");
        }

        catalogoProductos.clear();

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
            tarjeta.dataset.category = String(producto.categoria || "Otros").trim();
            tarjeta.dataset.search = [
                producto.nombre || "",
                producto.categoria || "",
                producto.descripcion || "",
                producto.caracteristicas || ""
            ].join(" ").toLowerCase();

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
                    >
                </div>

                <div class="product-info">
                    <h3>${textoSeguro(producto.nombre || "Producto")}</h3>

                    <p class="product-card-description">${textoSeguro(descripcionResumen(producto.descripcion || ""))}</p>

                    <div class="product-price">
                        ${textoSeguro(formatearPrecio(producto.precio))}
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

            const botonVer = tarjeta.querySelector(".view-product");
            const botonAgregar = tarjeta.querySelector(".add-card-product");
            const selector = tarjeta.querySelector(".card-quantity-selector");
            const input = selector?.querySelector(".qty-input");

            botonVer?.addEventListener("click", () => verProducto(producto));

            if (!sinStock && selector && input) {
                configurarSelectorCantidad(selector, stock);

                botonAgregar?.addEventListener("click", () => {
                    const cantidad = obtenerCantidad(input, stock);
                    agregarAlCarrito(producto, cantidad);
                    input.value = "1";
                    actualizarBotonesCantidad(selector, stock);
                });
            }

            contenedor.appendChild(tarjeta);
        });

        construirFiltrosCategorias(productos);
        actualizarFiltroCatalogo();

    } catch (error) {
        console.error("Error cargando productos:", error);

        contenedor.innerHTML = `
            <div class="products-loading">
                No pudimos cargar los productos. Intentá nuevamente en unos minutos.
            </div>
        `;
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

function verProducto(producto) {
    const modal = document.getElementById("producto-dinamico");

    if (!modal) return;

    productoModalActual = producto;

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

    const precio = modal.querySelector(".dynamic-product-price");
    if (precio) precio.textContent = formatearPrecio(producto.precio);

    const precioMobile = modal.querySelector(".dynamic-product-price-mobile");
    if (precioMobile) precioMobile.textContent = formatearPrecio(producto.precio);

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

    setTimeout(() => {
        modal.querySelector(".product-detail-close")?.focus();
    }, 50);
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

    overlay.classList.add("active");
    drawer.classList.add("active");

    overlay.setAttribute("aria-hidden", "false");
    drawer.setAttribute("aria-hidden", "false");
    trigger?.setAttribute("aria-expanded", "true");

    document.body.classList.add("cart-open");

    setTimeout(() => {
        drawer.querySelector(".cart-close")?.focus();
    }, 50);
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

function finalizarPorWhatsApp() {
    const carrito = leerCarrito();

    if (carrito.length === 0) {
        mostrarToastCarrito(
            "Carrito vacío",
            "Agregá al menos un producto antes de finalizar."
        );
        return;
    }

    const unidades = cantidadTotal(carrito);
    const total = carrito.reduce(
        (suma, item) =>
            suma +
            (Number(item.precio) || 0) *
            Math.max(0, Number(item.cantidad) || 0),
        0
    );

    const detalle = carrito
        .map((item, indice) => {
            const cantidad = Math.max(1, Number(item.cantidad) || 1);
            const subtotal = (Number(item.precio) || 0) * cantidad;

            return `${indice + 1}. ${item.nombre}\n   Cantidad: ${cantidad}\n   Subtotal: ${formatearPrecio(subtotal)}`;
        })
        .join("\n\n");

    const mensaje = [
        "Hola Dorado Artículos de Pesca 👋",
        "",
        "Quiero realizar este pedido:",
        "",
        detalle,
        "",
        `Unidades: ${unidades}`,
        `TOTAL: ${formatearPrecio(total)}`,
        "",
        "¿Me indican formas de pago y entrega?"
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

    if (totalEl) totalEl.textContent = formatearPrecio(total);
    if (unidadesEl) {
        unidadesEl.textContent = `${unidades} ${unidades === 1 ? "unidad" : "unidades"}`;
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

    setTimeout(() => {
        document.getElementById("checkout-name")?.focus();
    }, 50);
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

async function iniciarPagoMercadoPago(evento) {
    evento?.preventDefault();

    const form = document.getElementById("checkout-form");
    const boton = document.getElementById("checkout-pay");
    if (!form || !boton) return;

    mostrarErrorCheckout("");
    if (!form.reportValidity()) return;

    const carrito = leerCarrito();
    if (carrito.length === 0) {
        mostrarErrorCheckout("Tu carrito está vacío.");
        return;
    }

    const datos = new FormData(form);
    const metodoPago = String(datos.get("metodo_pago") || "mercadopago").trim();
    const entrega = String(datos.get("entrega") || "retiro").trim();

    if (metodoPago === "efectivo" && entrega !== "retiro") {
        mostrarErrorCheckout("El pago en efectivo está disponible únicamente para retiro en el local.");
        return;
    }

    const cliente = {
        nombre: String(datos.get("nombre") || "").trim(),
        email: String(datos.get("email") || "").trim(),
        telefono: String(datos.get("telefono") || "").trim(),
        domicilio: String(datos.get("domicilio") || "").trim(),
        ciudad: String(datos.get("ciudad") || "").trim(),
        provincia: String(datos.get("provincia") || "").trim(),
        codigo_postal: String(datos.get("codigo_postal") || "").trim(),
        entrega,
        notas: String(datos.get("notas") || "").trim()
    };

    if (metodoPago !== "mercadopago") {
        const total = carrito.reduce((sum,item)=>sum+(Number(item.precio)||0)*Math.max(1,Number(item.cantidad)||1),0);
        const detalle = carrito.map((item,i)=>{
            const cantidad=Math.max(1,Number(item.cantidad)||1);
            return `${i+1}. ${item.nombre} · ${cantidad} u. · ${formatearPrecio((Number(item.precio)||0)*cantidad)}`;
        }).join("\n");
        const nombres = {transferencia:"Transferencia bancaria",efectivo:"Efectivo al retirar",whatsapp:"A coordinar"};
        const entregas = {retiro:"Retiro en el local",local:"Envío local",nacional:"Envío al resto de Argentina",coordinar:"A coordinar"};
        const mensaje = [
            "Hola Dorado Artículos de Pesca 👋",
            "Quiero confirmar este pedido desde la web:","",detalle,"",
            `TOTAL PRODUCTOS: ${formatearPrecio(total)}`,
            `Pago: ${nombres[metodoPago] || "A coordinar"}`,
            `Entrega: ${entregas[entrega] || entrega}`,
            "",`Nombre: ${cliente.nombre}`,`Teléfono: ${cliente.telefono}`,
            cliente.domicilio ? `Domicilio: ${cliente.domicilio}` : "",
            cliente.ciudad ? `Localidad: ${cliente.ciudad}` : "",
            cliente.notas ? `Aclaraciones: ${cliente.notas}` : "",
            "","¿Me confirman disponibilidad y los datos para continuar?"
        ].filter(Boolean).join("\n");
        window.open(`https://wa.me/${DORADO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener,noreferrer");
        return;
    }

    const items = carrito.map(item => ({
        id: item.id,
        cantidad: Math.max(1, Math.floor(Number(item.cantidad) || 1))
    }));

    boton.disabled = true;
    const htmlOriginal = boton.innerHTML;
    boton.innerHTML = '<span>Preparando pago…</span>';

    try {
        const respuesta = await fetch("/api/checkout", {
            method: "POST",
            headers: {"Content-Type": "application/json","Accept": "application/json"},
            body: JSON.stringify({ cliente, items })
        });
        const data = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok) throw new Error(data?.error || "No pudimos iniciar el pago.");
        if (!data?.init_point) throw new Error("Mercado Pago no devolvió un enlace de pago.");

        const orderId = String(data.order_id || "");
        const trackingToken = String(data.tracking_token || "");
        if (orderId && trackingToken) guardarReferenciaPedido(orderId, trackingToken);
        sessionStorage.setItem("doradoUltimoPedido", orderId);
        window.location.assign(data.init_point);
    } catch (error) {
        console.error("Error iniciando pago:", error);
        mostrarErrorCheckout(error?.message || "No pudimos iniciar el pago. Probá nuevamente o coordiná por WhatsApp.");
        boton.disabled = false;
        boton.innerHTML = htmlOriginal;
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
    const estadoRetorno = params.get("checkout");
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
                titulo: "¡Compra confirmada!",
                mensaje: "Tu pago fue aprobado y el pedido quedó confirmado correctamente.",
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
let categoriaActiva = "Todos";

function construirFiltrosCategorias(productos = []) {
    const wrap = document.getElementById("categorias");
    if (!wrap) return;
    const preferidas = ["Cañas","Reels","Señuelos","Líneas y Tanzas","Anzuelos y Terminales","Boyas","Accesorios","Indumentaria","Carnadas"];
    const detectadas = [...new Set(productos.map(p => String(p.categoria || "Otros").trim()).filter(Boolean))];
    const categorias = ["Todos", ...preferidas.filter(x=>detectadas.includes(x)), ...detectadas.filter(x=>!preferidas.includes(x)).sort((a,b)=>a.localeCompare(b,"es"))];
    wrap.innerHTML = categorias.map(cat => `<button class="category-chip${cat===categoriaActiva?" active":""}" type="button" data-category="${textoSeguro(cat)}">${textoSeguro(cat)}</button>`).join("");
    wrap.querySelectorAll(".category-chip").forEach(btn=>btn.addEventListener("click",()=>{
        categoriaActiva = btn.dataset.category || "Todos";
        wrap.querySelectorAll(".category-chip").forEach(b=>b.classList.toggle("active",b===btn));
        actualizarFiltroCatalogo();
    }));
}

function actualizarFiltroCatalogo() {
    const input = document.getElementById("product-search");
    const contador = document.getElementById("product-result-count");
    const query = String(input?.value || "").trim().toLowerCase();
    const cards = Array.from(document.querySelectorAll("#products-grid .product"));
    let visibles = 0;
    cards.forEach(card => {
        const coincideTexto = !query || String(card.dataset.search || card.textContent || "").includes(query);
        const coincideCategoria = categoriaActiva === "Todos" || String(card.dataset.category || "Otros") === categoriaActiva;
        const coincide = coincideTexto && coincideCategoria;
        card.hidden = !coincide;
        if (coincide) visibles += 1;
    });
    if (contador) {
        if (!cards.length) contador.textContent = "Sin productos disponibles";
        else if (query || categoriaActiva !== "Todos") contador.textContent = `${visibles} ${visibles === 1 ? "resultado" : "resultados"}`;
        else contador.textContent = `${cards.length} ${cards.length === 1 ? "producto" : "productos"} disponibles`;
    }
}
document.getElementById("product-search")?.addEventListener("input", actualizarFiltroCatalogo);

(function configurarUIVisual(){
    const header = document.getElementById("site-header");
    const onScroll = () => header?.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive:true });
    onScroll();

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold:.10, rootMargin:"0px 0px -5% 0px" });

        document.querySelectorAll(".reveal").forEach(el => observer.observe(el));
    } else {
        document.querySelectorAll(".reveal").forEach(el => el.classList.add("is-visible"));
    }

    // Hero depth only on pointer devices; mobile remains static and lightweight.
    const stage = document.querySelector(".hero-product-stage");
    if (stage && window.matchMedia("(pointer:fine)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        stage.addEventListener("pointermove", event => {
            const rect = stage.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - .5;
            const y = (event.clientY - rect.top) / rect.height - .5;
            stage.style.setProperty("--mx", `${x * 8}px`);
            stage.style.setProperty("--my", `${y * 8}px`);
            const image = stage.querySelector(".hero-product-image");
            if (image) image.style.transform = `translate(${x * 7}px, ${y * 5 - 3}px) scale(1.018)`;
        });
        stage.addEventListener("pointerleave", () => {
            const image = stage.querySelector(".hero-product-image");
            if (image) image.style.transform = "";
        });
    }
})();


renderCarrito();
cargarProductosDesdeSupabase();
comprobarRetornoPago();


// Navegación móvil: resalta la sección visible sin interferir con el carrito.
(function configurarDockMovil(){
    const items = Array.from(document.querySelectorAll('.mobile-dock-item[data-dock]'));
    if (!items.length) return;

    const actualizar = () => {
        const productos = document.getElementById('productos');
        const y = window.scrollY + window.innerHeight * 0.34;
        const enProductos = productos && y >= productos.offsetTop;
        items.forEach(item => {
            item.classList.toggle('active', enProductos ? item.dataset.dock === 'productos' : item.dataset.dock === 'inicio');
        });
    };

    window.addEventListener('scroll', actualizar, { passive:true });
    window.addEventListener('resize', actualizar);
    actualizar();
})();

// ==============================

(() => {
  const header = document.getElementById('site-header');
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('primary-navigation');
  if (!header || !toggle || !nav) return;

  const closeMenu = () => {
    header.classList.remove('menu-open');
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Abrir menú');
  };

  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', open);
    document.body.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });

  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
  window.addEventListener('resize', () => { if (window.innerWidth > 980) closeMenu(); }, {passive:true});
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
})();

// ==============================

(function(){
  const steps = document.querySelectorAll('.process-step');
  steps.forEach((step) => {
    step.addEventListener('click', () => {
      step.classList.remove('fe-tap-pop');
      void step.offsetWidth;
      step.classList.add('fe-tap-pop');
      window.setTimeout(() => step.classList.remove('fe-tap-pop'), 280);
    });
  });
})();

// ==============================

(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canObserve = 'IntersectionObserver' in window;
  document.documentElement.classList.add('motion-enhanced');

  let observer = null;

  const watch = (el, direction='up', delay=0, heading=false) => {
    if (!el || el.classList.contains('motion-item')) return;
    el.classList.add('motion-item', `motion-${direction}`);
    if (heading) el.classList.add('motion-heading');
    el.style.setProperty('--motion-delay', `${Math.max(0, delay)}ms`);

    if (reduce || !canObserve) {
      el.classList.add('motion-visible');
      return;
    }

    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * .80 && rect.bottom > 0;
    if (inView) {
      requestAnimationFrame(() => el.classList.add('motion-visible'));
      return;
    }
    observer?.observe(el);
  };

  if (!reduce && canObserve) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('motion-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold:.16, rootMargin:'0px 0px -20% 0px' });
  }

  const group = (selector, directions=['up'], step=80, start=0, heading=false) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      watch(el, directions[i % directions.length], start + i * step, heading);
    });
  };

  group('.features .feature', ['left','up','up','right'], 95, 0);

  group('.catalog-section .section-index', ['down'], 0, 0);
  group('.catalog-section .kicker', ['left'], 0, 55);
  group('.catalog-section .section-title', ['left'], 0, 110, true);
  group('.catalog-section .section-desc', ['up'], 0, 175);
  group('.catalog-section .catalog-tools', ['right'], 0, 120);

  group('.process-intro .section-index', ['down'], 0, 0);
  group('.process-intro .kicker', ['left'], 0, 60);
  group('.process-intro h2', ['left'], 0, 115, true);
  group('.process-intro > p', ['up'], 0, 180);
  group('.process-intro .process-link', ['up'], 0, 230);
  group('.process-steps .process-step', ['right'], 115, 55);

  group('.about-copy .section-index', ['down'], 0, 0);
  group('.about-meta-row', ['right'], 0, 65);
  group('.about-copy .kicker', ['left'], 0, 105);
  group('.about-copy h2', ['left'], 0, 145, true);
  group('.about-copy > p', ['up'], 0, 205);
  group('.about-copy-note', ['up'], 0, 250);
  group('.about-highlights .about-highlight', ['left','up','right'], 105, 100);

  group('.location-copy .section-index', ['down'], 0, 0);
  group('.location-copy .kicker', ['left'], 0, 55);
  group('.location-copy h2', ['left'], 0, 110, true);
  group('.location-copy > p', ['up'], 0, 170);
  group('.contact-list .contact-line', ['up'], 105, 120);
  group('.contact-actions', ['up'], 0, 240);
  group('.location .map', ['right'], 0, 110);

  group('.site-footer .footer-brand-box', ['left'], 0, 0);
  group('.site-footer .footer-column', ['up'], 95, 80);
  group('.site-footer .footer-wordmark', ['scale'], 0, 110, true);
  group('.site-footer .footer-bottom', ['up'], 0, 170);

  const productGrid = document.getElementById('products-grid');
  const registerProducts = () => {
    if (!productGrid) return;
    productGrid.querySelectorAll('.product').forEach((card, i) => {
      watch(card, 'up', Math.min((i % 4) * 100, 300));
    });
  };

  if (productGrid) {
    registerProducts();
    const productObserver = new MutationObserver(() => registerProducts());
    productObserver.observe(productGrid, { childList:true });
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
        helper.textContent = "Elegí la dirección correcta de la lista.";
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

            renderSuggestions(data?.suggestions || []);

            if (!data?.suggestions?.length) {
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
        timer = window.setTimeout(searchAddress, 420);
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
        }
    });

    input.addEventListener("blur", () => {
        if (selectingSuggestion) return;

        const current = String(input.value || "").trim();

        /* Si el cliente escribió una dirección completa manualmente
           (calle + número) y pasa al siguiente campo, la damos por cargada.
           No volvemos a abrir sugerencias salvo que modifique el domicilio. */
        if (current.length >= 4 && /\d/.test(current)) {
            selectedAddressValue = normalizar(current);
            lastQuery = current;
            helper.textContent = "Dirección cargada.";
            helper.classList.add("selected");
        }

        window.setTimeout(() => {
            if (!selectingSuggestion) closeSuggestions();
        }, 180);
    });

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
        if(seen||reduced){intro.classList.add("hide");}
        else{
            document.body.style.overflow="hidden";
            window.setTimeout(()=>{intro.classList.add("hide");document.body.style.overflow="";sessionStorage.setItem("doradoIntroSeen","1");},3400);
            window.setTimeout(()=>intro.remove(),4300);
        }
    }

    const payment=document.getElementById("checkout-payment-method");
    const delivery=document.getElementById("checkout-delivery");
    const payButton=document.getElementById("checkout-pay");
    const help=document.getElementById("checkout-payment-help");
    const addressFields=["checkout-address","checkout-city","checkout-province","checkout-postal"].map(id=>document.getElementById(id)).filter(Boolean);

    const updateCheckout=()=>{
        const method=payment?.value||"mercadopago";
        const retiro=delivery?.value==="retiro";
        addressFields.forEach(el=>{el.required=!retiro; el.closest?.(".checkout-field")?.classList.toggle("optional-for-pickup",retiro);});
        if(!payButton)return;
        const span=payButton.querySelector("span");
        if(method==="mercadopago"){
            if(span)span.textContent="Pagar con Mercado Pago";
            if(help)help.textContent="🔒 Tarjetas y saldo se procesan en Mercado Pago. Dorado no recibe ni guarda los datos de tu tarjeta.";
        }else if(method==="transferencia"){
            if(span)span.textContent="Coordinar transferencia por WhatsApp";
            if(help)help.textContent="La web arma tu pedido y abre WhatsApp para recibir los datos de transferencia y coordinar la entrega.";
        }else if(method==="efectivo"){
            if(span)span.textContent="Coordinar efectivo por WhatsApp";
            if(help)help.textContent="El efectivo está disponible únicamente con retiro en el local.";
        }else{
            if(span)span.textContent="Coordinar pedido por WhatsApp";
            if(help)help.textContent="Te enviamos el resumen completo del carrito por WhatsApp para coordinar pago y entrega.";
        }
    };
    payment?.addEventListener("change",updateCheckout);
    delivery?.addEventListener("change",updateCheckout);
    updateCheckout();
})();

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
    document.querySelector(".checkout-whatsapp")?.addEventListener("click", finalizarPorWhatsApp);

    document.getElementById("orders-overlay")?.addEventListener("click", cerrarMisPedidos);
    document.querySelector(".orders-close")?.addEventListener("click", cerrarMisPedidos);
    document.getElementById("orders-refresh")?.addEventListener("click", () => cargarMisPedidos(true));

    document.getElementById("cart-overlay")?.addEventListener("click", cerrarCarrito);
    document.querySelector(".cart-close")?.addEventListener("click", cerrarCarrito);
    document.getElementById("cart-checkout")?.addEventListener("click", abrirCheckout);
    document.getElementById("cart-continue-shopping")?.addEventListener("click", cerrarCarrito);
    document.getElementById("cart-clear")?.addEventListener("click", vaciarCarrito);
})();

