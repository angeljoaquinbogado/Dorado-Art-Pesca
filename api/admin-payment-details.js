import { consumeRateLimit, enforceRateLimit, fetchWithTimeout, isSameOriginRequest } from "../lib/security.js";

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function numberOrNull(value){
    const n=Number(value);
    return Number.isFinite(n)?n:null;
}

function positiveAmount(value){
    const n=numberOrNull(value);
    return n===null?0:Math.max(0,n);
}

function chargeLabel(name,type){
    const raw=`${String(name||"")} ${String(type||"")}`.trim().toLowerCase();

    if(raw.includes("iva"))return "IVA";
    if(raw.includes("ingresos_brutos")||raw.includes("gross_income")||raw.includes("iibb"))return "Retención Ingresos Brutos";
    if(raw.includes("ganancias")||raw.includes("income_tax"))return "Retención Ganancias";
    if(raw.includes("mercadopago")&&raw.includes("fee"))return "Comisión Mercado Pago";
    if(raw.includes("financing"))return "Costo de financiación";
    if(raw.includes("tax")||raw.includes("withholding")||raw.includes("retention")||raw.includes("impuesto"))return "Impuestos / retenciones";
    if(raw.includes("fee")||raw.includes("commission")||raw.includes("comision"))return "Comisión / cargo de Mercado Pago";
    return String(name||type||"Cargo de Mercado Pago")
        .replaceAll("_"," ")
        .replace(/\b\w/g,char=>char.toUpperCase());
}

function feeLabel(type){
    const key=String(type||"").toLowerCase();
    const labels={
        mercadopago_fee:"Comisión Mercado Pago",
        financing_fee:"Costo de financiación",
        coupon_fee:"Costo promocional",
        application_fee:"Cargo de aplicación"
    };
    return labels[key]||chargeLabel(type,"fee");
}

async function parseJson(response,fallback){
    try{return await response.json();}catch{return fallback;}
}

async function fetchPaymentByReference(orderId,token){
    const response=await fetchWithTimeout(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc&limit=20`,
        {
            headers:{
                Authorization:`Bearer ${token}`,
                Accept:"application/json"
            }
        },
        10000
    );

    const data=await parseJson(response,{});
    if(!response.ok)return null;

    const results=Array.isArray(data?.results)?data.results:[];
    return results.find(payment=>String(payment?.external_reference||"")===orderId)||null;
}

export default async function handler(req,res){
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Content-Type-Options","nosniff");

    if(req.method!=="GET"){
        res.setHeader("Allow","GET");
        return res.status(405).json({error:"Método no permitido"});
    }

    if(!isSameOriginRequest(req)){
        return res.status(403).json({error:"Origen no autorizado."});
    }

    const id=String(req.query?.id||"").trim();
    if(!UUID_RE.test(id)){
        return res.status(400).json({error:"Pedido inválido."});
    }

    try{
        const rate=await consumeRateLimit(req,{
            scope:"admin-payment-details",
            limit:30,
            windowSeconds:60,
            subject:id
        });
        if(enforceRateLimit(res,rate,"Demasiadas consultas de liquidación. Esperá un momento."))return;
    }catch(error){
        console.error("Admin payment details rate limit error:",error?.message||error);
        return res.status(503).json({error:"No se pudo validar la consulta."});
    }

    const supabaseUrl=String(process.env.SUPABASE_URL||"").trim();
    const serviceKey=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
    const mpToken=String(process.env.MERCADOPAGO_ACCESS_TOKEN||"").trim();
    const auth=String(req.headers.authorization||"").trim();

    if(!supabaseUrl||!serviceKey||!mpToken){
        return res.status(500).json({error:"Configuración incompleta del servidor."});
    }

    if(!auth.startsWith("Bearer ")){
        return res.status(401).json({error:"Sesión requerida."});
    }

    const accessToken=auth.slice(7).trim();

    try{
        /*
         * Validación de permisos: la consulta se ejecuta con el JWT del administrador,
         * por lo que las políticas RLS de pedidos siguen siendo la autoridad.
         */
        const orderResponse=await fetchWithTimeout(
            `${supabaseUrl}/rest/v1/pedidos?id=eq.${encodeURIComponent(id)}&select=id,total,estado,mp_payment_id&limit=1`,
            {
                headers:{
                    apikey:serviceKey,
                    Authorization:`Bearer ${accessToken}`,
                    Accept:"application/json"
                }
            },
            8000
        );

        const orders=await parseJson(orderResponse,[]);

        if(orderResponse.status===401||orderResponse.status===403){
            return res.status(403).json({error:"No tenés permisos para consultar esta liquidación."});
        }

        if(!orderResponse.ok){
            console.error("Admin payment order lookup failed",{status:orderResponse.status,orderId:id});
            return res.status(502).json({error:"No se pudo validar el pedido."});
        }

        if(!Array.isArray(orders)||!orders[0]){
            return res.status(404).json({error:"Pedido no encontrado."});
        }

        const order=orders[0];
        const storedPaymentId=String(order.mp_payment_id||"").trim();
        let payment=null;

        if(/^\d{4,30}$/.test(storedPaymentId)){
            const paymentResponse=await fetchWithTimeout(
                `https://api.mercadopago.com/v1/payments/${encodeURIComponent(storedPaymentId)}`,
                {
                    headers:{
                        Authorization:`Bearer ${mpToken}`,
                        Accept:"application/json"
                    }
                },
                10000
            );

            if(paymentResponse.ok){
                payment=await parseJson(paymentResponse,null);
            }
        }

        if(!payment){
            payment=await fetchPaymentByReference(id,mpToken);
        }

        if(!payment?.id){
            return res.status(404).json({error:"Mercado Pago no informó una liquidación para este pedido."});
        }

        const reference=String(payment.external_reference||"");
        const orderTotal=positiveAmount(order.total);
        const transactionAmount=positiveAmount(payment.transaction_amount);

        if(reference!==id||Math.abs(transactionAmount-orderTotal)>0.01){
            console.error("Admin payment detail mismatch",{orderId:id,paymentId:String(payment.id||"")});
            return res.status(409).json({error:"La operación encontrada no coincide con este pedido."});
        }

        const status=String(payment.status||"").toLowerCase();
        const netRaw=numberOrNull(payment.transaction_details?.net_received_amount);
        const netReceived=status==="approved"&&netRaw!==null?Math.max(0,netRaw):null;
        const taxes=positiveAmount(payment.taxes_amount);
        const feeDetails=Array.isArray(payment.fee_details)?payment.fee_details:[];
        const chargeDetails=Array.isArray(payment.charges_details)?payment.charges_details:[];

        let breakdown=[];

        if(chargeDetails.length){
            breakdown=chargeDetails
                .map(charge=>{
                    const original=positiveAmount(charge?.amounts?.original);
                    const refunded=positiveAmount(charge?.amounts?.refunded);
                    const amount=Math.max(0,original-refunded);
                    if(!(amount>0))return null;
                    return {
                        label:chargeLabel(charge?.name,charge?.type),
                        amount
                    };
                })
                .filter(Boolean);
        }

        if(!breakdown.length){
            breakdown=feeDetails
                .map(fee=>{
                    const amount=positiveAmount(fee?.amount);
                    if(!(amount>0))return null;
                    return {
                        label:feeLabel(fee?.type),
                        amount
                    };
                })
                .filter(Boolean);

            if(taxes>0){
                breakdown.push({label:"Impuestos / retenciones",amount:taxes});
            }
        }

        const deductionTotal=netReceived===null
            ? null
            : Math.max(0,Math.round((transactionAmount-netReceived)*100)/100);

        if(deductionTotal!==null){
            const detailed=Math.round(breakdown.reduce((sum,item)=>sum+positiveAmount(item.amount),0)*100)/100;
            const remainder=Math.round((deductionTotal-detailed)*100)/100;
            if(remainder>0.01){
                breakdown.push({label:"Otros descuentos / ajustes",amount:remainder});
            }
        }

        return res.status(200).json({
            ok:true,
            payment_id:String(payment.id),
            status,
            status_detail:String(payment.status_detail||""),
            currency:String(payment.currency_id||"ARS"),
            transaction_amount:transactionAmount,
            total_paid_amount:numberOrNull(payment.transaction_details?.total_paid_amount),
            net_received_amount:netReceived,
            deductions_total:deductionTotal,
            taxes_amount:taxes||null,
            installments:Math.max(1,Number(payment.installments)||1),
            payment_method_id:String(payment.payment_method_id||""),
            payment_type_id:String(payment.payment_type_id||""),
            date_approved:String(payment.date_approved||""),
            breakdown:breakdown.slice(0,12)
        });
    }catch(error){
        console.error("Admin payment details error:",error?.message||error);
        return res.status(500).json({error:"No se pudo consultar la liquidación de Mercado Pago."});
    }
}
