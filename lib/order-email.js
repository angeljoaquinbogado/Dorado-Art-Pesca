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

export async function sendOrderConfirmationEmail({order,items,origin}){
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

    const html=`<!doctype html>
<html>
<body style="margin:0;background:#f5f2eb;font-family:Arial,Helvetica,sans-serif;color:#17191d">
  <div style="max-width:640px;margin:0 auto;padding:28px 14px">
    <div style="background:#0d0e10;border-radius:22px 22px 0 0;padding:24px;color:#fff">
      <div style="font-size:12px;letter-spacing:.14em;color:#d2aa3f;font-weight:700">DORADO ARTÍCULOS DE PESCA</div>
      <h1 style="font-size:30px;line-height:1.05;margin:10px 0 0">¡Compra confirmada!</h1>
      <p style="margin:10px 0 0;color:#c4c6ca;line-height:1.6;font-size:14px">
        Hola ${esc(order.cliente_nombre||"")}, recibimos tu pago correctamente.
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
      <div style="padding:18px 0 8px;font-size:18px">
        <strong>Total: ${esc(money(order.total))}</strong>
      </div>
      ${trackingUrl?`
      <a href="${esc(trackingUrl)}" style="display:block;margin-top:14px;background:#d5ad43;color:#111;text-decoration:none;text-align:center;font-weight:800;font-size:13px;padding:15px 18px;border-radius:999px">
        VER SEGUIMIENTO DEL PEDIDO
      </a>`:""}
      <p style="font-size:12px;color:#74777d;line-height:1.65;margin:20px 0 0">
        El costo y la modalidad de entrega se coordinan con DORADO ARTÍCULOS DE PESCA según tu ubicación.
        Si necesitás ayuda, respondé este email o contactanos por WhatsApp.
      </p>
      <p style="font-size:11px;color:#9a9ca0;line-height:1.55;margin:14px 0 0">
        Por seguridad, no compartas públicamente tu enlace de seguimiento.
      </p>
    </div>
  </div>
</body>
</html>`;

    const text=[
        "DORADO PESCA - Compra confirmada",
        `Pedido: ${code}`,
        `Total: ${money(order.total)}`,
        "",
        ...safeItems.map(item=>{
            const qty=Math.max(1,Number(item.cantidad)||1);
            const unit=Number(item.precio_unitario)||0;
            return `${qty} x ${item.nombre} - ${money(qty*unit)}`;
        }),
        "",
        trackingUrl ? `Seguimiento: ${trackingUrl}` : "",
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
        auth:{
            user:gmailUser,
            pass:appPassword
        }
    });

    const info=await transporter.sendMail({
        from:`"Dorado Artículos de Pesca" <${gmailUser}>`,
        to:recipient,
        replyTo:replyTo || gmailUser,
        subject:`Compra confirmada · ${code} · DORADO ARTÍCULOS DE PESCA`,
        text,
        html
    });

    return {sent:true,id:String(info?.messageId||"")};
}
