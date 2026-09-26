export function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

export function clampDiscountPercent(value) {
    const n = Number(value) || 0;
    return Math.min(90, Math.max(0, n));
}

export function productPrice(product) {
    const base = Math.max(0, Number(product?.precio) || 0);
    const percent = clampDiscountPercent(product?.descuento_porcentaje);
    const final = roundMoney(base * (1 - percent / 100));
    return { base: roundMoney(base), percent, final };
}

export function normalizeCouponCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "")
        .slice(0, 40);
}

export function couponStatus(coupon, subtotal, now = new Date()) {
    if (!coupon || !coupon.activo) return { valid: false, reason: "Cupón inexistente o inactivo." };

    const current = now.getTime();
    const from = coupon.vigente_desde ? new Date(coupon.vigente_desde).getTime() : null;
    const to = coupon.vigente_hasta ? new Date(coupon.vigente_hasta).getTime() : null;
    if (Number.isFinite(from) && current < from) return { valid: false, reason: "Este cupón todavía no está vigente." };
    if (Number.isFinite(to) && current > to) return { valid: false, reason: "Este cupón venció." };

    const minimum = Math.max(0, Number(coupon.minimo_compra) || 0);
    if (subtotal < minimum) {
        return { valid: false, reason: `Este cupón requiere una compra mínima de $${Math.round(minimum).toLocaleString("es-AR")}.` };
    }

    const limit = coupon.limite_usos == null ? null : Math.max(0, Number(coupon.limite_usos) || 0);
    const used = Math.max(0, Number(coupon.usos) || 0);
    if (limit !== null && used >= limit) return { valid: false, reason: "Este cupón alcanzó su límite de usos." };

    const type = String(coupon.tipo || "").toLowerCase();
    const value = Math.max(0, Number(coupon.valor) || 0);
    let discount = 0;
    if (type === "porcentaje") discount = subtotal * Math.min(100, value) / 100;
    else if (type === "fijo") discount = value;
    else return { valid: false, reason: "El cupón no tiene una configuración válida." };

    discount = Math.min(subtotal, roundMoney(discount));
    if (discount <= 0) return { valid: false, reason: "El cupón no genera un descuento válido." };

    const total = roundMoney(subtotal - discount);
    if (total < 1) {
        return { valid: false, reason: "Este cupón cubriría el total completo y no es compatible con el pago online." };
    }

    return {
        valid: true,
        discount,
        total
    };
}
