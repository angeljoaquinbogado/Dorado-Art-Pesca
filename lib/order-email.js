import nodemailer from "nodemailer";

function esc(value){
    return String(value ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function money(value){
    return new Intl.NumberFormat("es-AR",{
        style:"currency",
        currency:"ARS",
        maximumFractionDigits:0
    }).format(Number(value)||0);
}

export function formatOrderCode(id){
    const raw=String(id||"").replaceAll("-","").toUpperCase();
    return raw ? `DP-${raw.slice(0,10)}` : "DP-—";
}

function emailCopy(kind, order, expiresAt){
    const expiry = expiresAt ? new Date(expiresAt) : null;
    const expiryText = expiry && Number.isFinite(expiry.getTime())
        ? expiry.toLocaleString("es-AR", { dateStyle:"short", timeStyle:"short", timeZone:"America/Argentina/Buenos_Aires" })
        : "dentro de las próximas 24 horas";

    if(kind === "pending") return {
        eyebrow:"PAGO PENDIENTE",
        title:"Tu pedido quedó pendiente",
        intro:`Hola ${order.cliente_nombre||""}, guardamos tu pedido. Tenés 24 horas para completar o reintentar el pago con los medios disponibles en Mercado Pago.`,
        note:`El enlace de pago estará disponible hasta ${expiryText}. Si no completás el pago dentro de ese plazo, el pedido puede quedar sin efecto.`,
        subject:"Pago pendiente",
        cta:"REINTENTAR / COMPLETAR PAGO"
    };
    if(kind === "cancelled") return {
        eyebrow:"PAGO NO COMPLETADO",
        title:"El pago no se completó",
        intro:`Hola ${order.cliente_nombre||""}, el pago de tu pedido fue rechazado o cancelado. No se descontó stock como compra confirmada.`,
        note:"Si el enlace sigue vigente, podés volver a intentar con otro medio de pago. También podés responder este email para pedir ayuda.",
        subject:"Pago cancelado",
        cta:"VOLVER A INTENTAR EL PAGO"
    };
    if(kind === "refunded") return {
        eyebrow:"PAGO REEMBOLSADO",
        title:"Tu pago fue reembolsado",
        intro:`Hola ${order.cliente_nombre||""}, Mercado Pago informó un reembolso o contracargo asociado a tu pedido.`,
        note:"Si necesitás revisar el estado del pedido, respondé este email y te ayudamos.",
        subject:"Pago reembolsado",
        cta:"VER SEGUIMIENTO"
    };
    return {
        eyebrow:"PAGO APROBADO",
        title:"¡Compra confirmada!",
        intro:`Hola ${order.cliente_nombre||""}, recibimos tu pago correctamente y tu pedido ya quedó confirmado.`,
        note:"El costo y la modalidad de entrega se coordinan con DORADO ARTÍCULOS DE PESCA según tu ubicación.",
        subject:"Compra confirmada",
        cta:"VER SEGUIMIENTO DEL PEDIDO"
    };
}

export async function sendOrderStatusEmail({kind="confirmed",order,items,origin,paymentUrl="",expiresAt=null}){
    const gmailUser=String(process.env.GMAIL_USER||"doradoartpesca@gmail.com").trim();
    const appPassword=String(process.env.GMAIL_APP_PASSWORD||"").replace(/\s+/g,"").trim();
    const replyTo=String(process.env.EMAIL_REPLY_TO||gmailUser).trim();
    const recipient=String(order?.cliente_email||"").trim();

    if(!gmailUser||!appPassword||!recipient){
        return {sent:false,skipped:true};
    }

    const code=formatOrderCode(order.id);
    const trackingToken=String(order.tracking_token||"").trim();
    const baseOrigin=String(origin||"").replace(/\/$/,"");
    const trackingUrl=trackingToken
        ? `${baseOrigin}/pedido.html?id=${encodeURIComponent(order.id)}&tracking=${encodeURIComponent(trackingToken)}`
        : "";
    const copy=emailCopy(kind,order,expiresAt);
    const ctaUrl = (kind === "pending" || kind === "cancelled") && paymentUrl ? paymentUrl : trackingUrl;

    const safeItems=Array.isArray(items)?items:[];
    const itemRows=safeItems.map(item=>{
        const qty=Math.max(1,Number(item.cantidad)||1);
        const unit=Number(item.precio_unitario)||0;
        return `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #ece8df;color:#24262a">
                <strong>${esc(item.nombre)}</strong><br>
                <span style="font-size:12px;color:#777">${qty} × ${esc(money(unit))}</span>
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #ece8df;text-align:right;font-weight:700;color:#24262a">
                ${esc(money(qty*unit))}
            </td>
        </tr>`;
    }).join("");

    const subtotal=Number(order.subtotal ?? order.total)||0;
    const discount=Math.max(0,Number(order.descuento_total)||0);
    const coupon=String(order.cupon_codigo||"").trim();

    const html=`<!doctype html><html><body style="margin:0;background:#f5f2eb;font-family:Arial,Helvetica,sans-serif;color:#17191d">
      <div style="max-width:640px;margin:0 auto;padding:28px 14px">
        <div style="background:#0d0e10;border-radius:22px 22px 0 0;padding:24px;color:#fff">
          <div style="font-size:12px;letter-spacing:.14em;color:#d2aa3f;font-weight:700">DORADO ARTÍCULOS DE PESCA · ${esc(copy.eyebrow)}</div>
          <h1 style="font-size:30px;line-height:1.05;margin:10px 0 0">${esc(copy.title)}</h1>
          <p style="margin:10px 0 0;color:#c4c6ca;line-height:1.6;font-size:14px">${esc(copy.intro)}</p>
        </div>
        <div style="background:#fff;border:1px solid #e5dfd5;border-top:0;border-radius:0 0 22px 22px;padding:24px">
          <div style="padding:14px 16px;background:#faf8f3;border-radius:14px;margin-bottom:18px">
            <div style="font-size:10px;color:#8a8c91;font-weight:700;letter-spacing:.08em">NÚMERO DE PEDIDO</div>
            <div style="font-size:24px;font-weight:800;margin-top:4px">${esc(code)}</div>
          </div>
          <table role="presentation" style="width:100%;border-collapse:collapse">${itemRows}</table>
          ${discount>0?`<div style="padding-top:16px;font-size:13px;color:#62656b;display:flex;justify-content:space-between"><span>Subtotal</span><strong>${esc(money(subtotal))}</strong></div><div style="padding-top:6px;font-size:13px;color:#8b650f;display:flex;justify-content:space-between"><span>Descuento${coupon?` · ${esc(coupon)}`:""}</span><strong>-${esc(money(discount))}</strong></div>`:""}
          <div style="padding:16px 0 8px;font-size:18px"><strong>Total: ${esc(money(order.total))}</strong></div>
          ${ctaUrl?`<a href="${esc(ctaUrl)}" style="display:block;margin-top:14px;background:#d5ad43;color:#111;text-decoration:none;text-align:center;font-weight:800;font-size:13px;padding:15px 18px;border-radius:999px">${esc(copy.cta)}</a>`:""}
          <p style="font-size:12px;color:#74777d;line-height:1.65;margin:20px 0 0">${esc(copy.note)}</p>
          <p style="font-size:12px;color:#74777d;line-height:1.65;margin:12px 0 0">Si necesitás ayuda, respondé este email. Nuestro correo de contacto es doradoartpesca@gmail.com.</p>
          <p style="font-size:11px;color:#9a9ca0;line-height:1.55;margin:14px 0 0">Por seguridad, no compartas públicamente tu enlace de seguimiento o pago.</p>
        </div>
      </div>
    </body></html>`;

    const text=[
        `DORADO ARTÍCULOS DE PESCA - ${copy.subject}`,
        `Pedido: ${code}`,
        copy.intro,
        "",
        ...safeItems.map(item=>`${Math.max(1,Number(item.cantidad)||1)} x ${item.nombre} - ${money((Number(item.precio_unitario)||0)*Math.max(1,Number(item.cantidad)||1))}`),
        "",
        discount>0?`Subtotal: ${money(subtotal)}`:"",
        discount>0?`Descuento${coupon?` (${coupon})`:""}: -${money(discount)}`:"",
        `Total: ${money(order.total)}`,
        paymentUrl && (kind==="pending"||kind==="cancelled") ? `Pago: ${paymentUrl}` : "",
        trackingUrl ? `Seguimiento: ${trackingUrl}` : "",
        "",
        copy.note,
        "Contacto: doradoartpesca@gmail.com"
    ].filter(Boolean).join("\n");

    const transporter=nodemailer.createTransport({
        host:"smtp.gmail.com",port:465,secure:true,
        connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000,
        auth:{user:gmailUser,pass:appPassword}
    });

    const info=await transporter.sendMail({
        from:`"Dorado Artículos de Pesca" <${gmailUser}>`,
        to:recipient,
        replyTo:replyTo || gmailUser,
        subject:`${copy.subject} · ${code} · DORADO ARTÍCULOS DE PESCA`,
        text,html
    });
    return {sent:true,id:String(info?.messageId||"")};
}

export async function sendOrderConfirmationEmail(args){
    return sendOrderStatusEmail({...args,kind:"confirmed"});
}
