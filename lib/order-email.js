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

function dateAr(value){
    if(!value)return "";
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return "";
    return new Intl.DateTimeFormat("es-AR",{
        dateStyle:"long",
        timeStyle:"short",
        timeZone:"America/Argentina/Buenos_Aires"
    }).format(date);
}

export function formatOrderCode(id){
    const raw=String(id||"").replaceAll("-","").toUpperCase();
    return raw ? `DP-${raw.slice(0,10)}` : "DP-—";
}

function eventCopy(event, order){
    const expires=dateAr(order?.expira_pago_at);
    if(event==="pendiente"){
        return {
            eyebrow:"PAGO PENDIENTE",
            title:"Tu pedido quedó pendiente.",
            intro:`Guardamos tu pedido durante 24 horas${expires?`, hasta el ${expires}`:""}. Podés volver a intentar el pago desde tu enlace privado y elegir cualquiera de los medios disponibles en Mercado Pago.`,
            subject:"Pago pendiente",
            cta:"VER PEDIDO Y REINTENTAR PAGO",
            accent:"#c68110",
            note:"Si ya completaste el pago, esperá unos minutos y actualizá el estado desde el enlace del pedido."
        };
    }
    if(event==="cancelado"){
        return {
            eyebrow:"PAGO NO COMPLETADO",
            title:"El pago no se completó.",
            intro:`El intento de pago fue rechazado o cancelado. Si todavía estás dentro de las 24 horas${expires?` —hasta el ${expires}—`:""}, podés intentar nuevamente desde tu enlace privado.`,
            subject:"Pago no completado",
            cta:"VER PEDIDO",
            accent:"#a8433a",
            note:"No se descuenta stock ni se prepara el pedido hasta que el pago quede confirmado."
        };
    }
    return {
        eyebrow:"COMPRA CONFIRMADA",
        title:"¡Compra confirmada!",
        intro:"Recibimos tu pago correctamente. Este email funciona como comprobante de la compra y contiene el acceso privado al seguimiento.",
        subject:"Compra confirmada",
        cta:"VER SEGUIMIENTO DEL PEDIDO",
        accent:"#d5ad43",
        note:"El costo y la modalidad de entrega se coordinan con Dorado Artículos de Pesca según tu ubicación."
    };
}

export async function sendOrderStatusEmail({order,items,origin,event="pagado"}){
    const gmailUser=String(process.env.GMAIL_USER||"").trim();
    const appPassword=String(process.env.GMAIL_APP_PASSWORD||"").replace(/\s+/g,"").trim();
    const replyTo=String(process.env.EMAIL_REPLY_TO||gmailUser).trim();
    const recipient=String(order?.cliente_email||"").trim();

    if(!gmailUser||!appPassword||!recipient){
        return {sent:false,skipped:true};
    }

    const code=formatOrderCode(order.id);
    const trackingToken=String(order.tracking_token||"").trim();
    const trackingUrl=trackingToken
        ? `${String(origin||"").replace(/\/$/,"")}/pedido.html?id=${encodeURIComponent(order.id)}&tracking=${encodeURIComponent(trackingToken)}`
        : "";

    const copy=eventCopy(event,order);
    const safeItems=Array.isArray(items)?items:[];
    const itemRows=safeItems.map(item=>{
        const qty=Math.max(1,Number(item.cantidad)||1);
        const unit=Number(item.precio_unitario)||0;
        const list=Math.max(unit,Number(item.precio_lista)||unit);
        const old=list>unit+0.009
            ? `<span style="font-size:11px;color:#96999f;text-decoration:line-through;margin-left:6px">${esc(money(list))}</span>`
            : "";
        return `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #ece8df;color:#24262a">
                <strong>${esc(item.nombre)}</strong><br>
                <span style="font-size:12px;color:#777">${qty} × ${esc(money(unit))}</span>${old}
            </td>
            <td style="padding:10px 0;border-bottom:1px solid #ece8df;text-align:right;font-weight:700;color:#24262a">
                ${esc(money(qty*unit))}
            </td>
        </tr>`;
    }).join("");

    const subtotal=Number(order?.subtotal)||Number(order?.total)||0;
    const couponDiscount=Math.max(0,Number(order?.descuento_cupon)||0);
    const productDiscount=Math.max(0,Number(order?.descuento_productos)||0);
    const discountRows=[
        productDiscount>0 ? `<div style="display:flex;justify-content:space-between;gap:18px;padding:5px 0;color:#4d5158"><span>Descuentos en productos</span><strong>− ${esc(money(productDiscount))}</strong></div>` : "",
        couponDiscount>0 ? `<div style="display:flex;justify-content:space-between;gap:18px;padding:5px 0;color:#176c45"><span>Cupón${order?.cupon_codigo?` ${esc(order.cupon_codigo)}`:""}</span><strong>− ${esc(money(couponDiscount))}</strong></div>` : ""
    ].join("");

    const html=`<!doctype html>
<html>
<body style="margin:0;background:#f5f2eb;font-family:Arial,Helvetica,sans-serif;color:#17191d">
  <div style="max-width:640px;margin:0 auto;padding:28px 14px">
    <div style="background:#0d0e10;border-radius:22px 22px 0 0;padding:24px;color:#fff">
      <div style="font-size:12px;letter-spacing:.14em;color:${copy.accent};font-weight:700">DORADO ARTÍCULOS DE PESCA · ${esc(copy.eyebrow)}</div>
      <h1 style="font-size:30px;line-height:1.05;margin:10px 0 0">${esc(copy.title)}</h1>
      <p style="margin:10px 0 0;color:#c4c6ca;line-height:1.6;font-size:14px">
        Hola ${esc(order.cliente_nombre||"")}, ${esc(copy.intro)}
      </p>
    </div>
    <div style="background:#fff;border:1px solid #e5dfd5;border-top:0;border-radius:0 0 22px 22px;padding:24px">
      <div style="padding:14px 16px;background:#faf8f3;border-radius:14px;margin-bottom:18px">
        <div style="font-size:10px;color:#8a8c91;font-weight:700;letter-spacing:.08em">NÚMERO DE PEDIDO</div>
        <div style="font-size:24px;font-weight:800;margin-top:4px">${esc(code)}</div>
      </div>
      <table role="presentation" style="width:100%;border-collapse:collapse">
        ${itemRows}
      </table>
      <div style="padding:16px 0 8px;font-size:12px">
        ${subtotal>0? `<div style="display:flex;justify-content:space-between;gap:18px;padding:5px 0;color:#4d5158"><span>Subtotal</span><strong>${esc(money(subtotal))}</strong></div>`:""}
        ${discountRows}
        <div style="display:flex;justify-content:space-between;gap:18px;padding:12px 0 0;font-size:18px;border-top:1px solid #ece8df;margin-top:8px">
          <strong>Total</strong><strong>${esc(money(order.total))}</strong>
        </div>
      </div>
      ${trackingUrl?`
      <a href="${esc(trackingUrl)}" style="display:block;margin-top:14px;background:${copy.accent};color:#111;text-decoration:none;text-align:center;font-weight:800;font-size:13px;padding:15px 18px;border-radius:999px">
        ${esc(copy.cta)}
      </a>`:""}
      <p style="font-size:12px;color:#74777d;line-height:1.65;margin:20px 0 0">
        ${esc(copy.note)} Si necesitás ayuda, respondé este email o contactanos por WhatsApp.
      </p>
      <p style="font-size:11px;color:#9a9ca0;line-height:1.55;margin:14px 0 0">
        Por seguridad, no compartas públicamente tu enlace de seguimiento.
      </p>
    </div>
  </div>
</body>
</html>`;

    const text=[
        `DORADO ARTÍCULOS DE PESCA - ${copy.subject}`,
        `Pedido: ${code}`,
        `Total: ${money(order.total)}`,
        order?.cupon_codigo ? `Cupón: ${order.cupon_codigo}` : "",
        "",
        ...safeItems.map(item=>{
            const qty=Math.max(1,Number(item.cantidad)||1);
            const unit=Number(item.precio_unitario)||0;
            return `${qty} x ${item.nombre} - ${money(qty*unit)}`;
        }),
        "",
        copy.intro,
        trackingUrl ? `Pedido y seguimiento: ${trackingUrl}` : "",
        "",
        "Si necesitás ayuda, respondé este email."
    ].filter(Boolean).join("\n");

    const transporter=nodemailer.createTransport({
        host:"smtp.gmail.com",
        port:465,
        secure:true,
        connectionTimeout:8000,
        greetingTimeout:8000,
        socketTimeout:12000,
        auth:{user:gmailUser,pass:appPassword}
    });

    const info=await transporter.sendMail({
        from:`"Dorado Artículos de Pesca" <${gmailUser}>`,
        to:recipient,
        replyTo:replyTo || gmailUser,
        subject:`${copy.subject} · ${code} · DORADO ARTÍCULOS DE PESCA`,
        text,
        html
    });

    return {sent:true,id:String(info?.messageId||"")};
}

export async function sendOrderConfirmationEmail(args){
    return sendOrderStatusEmail({...args,event:"pagado"});
}
