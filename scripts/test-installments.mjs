import assert from "node:assert/strict";
import { installmentPricing } from "../lib/pricing.js";

const example = installmentPricing({ precio:300000, descuento_porcentaje:0, cuotas_sin_interes_3:true });
assert.equal(example.cash,300000,"Precio al contado");
assert.equal(example.list,375000,"Precio final financiado: 20% menos da exactamente 300.000");
assert.equal(example.monthly,125000,"3 cuotas de 125.000");
assert.equal(example.cashDiscount,75000,"Descuento contado 20%");
assert.equal(example.collectionFee,29947.5,"Costo Checkout 6,60% más IVA");
assert.equal(example.installmentsFee,47598.38,"Costo 3 cuotas 10,49% más IVA");
assert.equal(example.estimatedNet,297454.12,"Dinero recibido antes de retenciones");

const noStack = installmentPricing({ precio:300000, descuento_porcentaje:30, cuotas_sin_interes_3:true });
assert.equal(noStack.list,375000,"No acumular descuento por producto con la promoción de cuotas");
assert.equal(noStack.cash,300000);

const common = installmentPricing({ precio:100000, descuento_porcentaje:10, cuotas_sin_interes_3:false });
assert.equal(common.promo,false);
assert.equal(common.list,90000,"No modificar los precios normales");
assert.equal(common.cash,90000);
assert.equal(common.collectionFee,0);

const disabled = installmentPricing({ precio:300000 });
assert.equal(disabled.list,300000,"Productos existentes no deben aumentar de precio");
console.log("Installments and cash pricing tests passed.");
// Las cuotas NO se anuncian si la promoción aún no está validada por el comercio.
const pending = installmentPricing({ precio: 300000, cuotas_sin_interes_3: true }, { promotionEnabled: false });
assert.equal(pending.promo, false, "La promoción debe permanecer inactiva");
assert.equal(pending.list, 300000, "No cobrar un precio financiado si la promo no está verificada");
assert.equal(pending.cash, 300000, "No mostrar descuentos ficticios antes de activar la promo");
assert.equal(pending.installmentsFee, 0, "No simular cargos de cuotas deshabilitadas");
console.log("Pending interest-free promotion safety tests passed.");