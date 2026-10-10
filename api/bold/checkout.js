const { createHash, createHmac, randomBytes, randomUUID } = require('node:crypto');
const variants = require('../../bold-config.js');
const payments = require('./_lib/payments.cjs');
const orders = require('./_lib/orders.cjs');

function createCheckout(env = process.env, storeFactory = payments.createStore) {
  return async function checkout(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, {error:'Método no permitido.'}); }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415, {error:'Solicitud no válida.'});
    let input;
    try {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (Buffer.byteLength(raw || '') > 8192) return reply(413, {error:'Solicitud no válida.'});
      input = orders.checkoutInput(JSON.parse(raw));
    } catch (_) { /* The response never echoes personal data. */ }
    if (!input) return reply(400, {error:'Revisa la configuración y los datos del comprador.'});
    const requestId = req.headers['idempotency-key'] || randomUUID();
    if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId)) return reply(400, {error:'Solicitud no válida.'});
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return reply(403, {error:'Origen no permitido.'}); }
      catch (_) { return reply(403, {error:'Origen no permitido.'}); }
    }
    const {selection, customer} = input;
    const description = variants.orderDescription(selection);
    if (description.length > 100) return reply(400, {error:'Selección no válida.'});
    const apiKey = env.BOLD_IDENTITY_KEY, secretKey = env.BOLD_SECRET_KEY;
    if (!apiKey?.trim() || !secretKey?.trim() || !payments.enabled(env)) {
      return reply(503, {error:'El pago no está disponible en este momento.'});
    }
    let amount, unitPrice;
    let orderId = `KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`;
    const hmac = value => createHmac('sha256', secretKey).update(value).digest('hex');
    const statusToken = id => hmac('kaemento-order-status:' + id);
    try {
      // Never issue a payable signature without a durable, complete order.
      const record = {...payments.orderRecord(orderId, selection, customer),
        statusTokenHash:createHash('sha256').update(statusToken(orderId)).digest('hex'),
        statusAccessUntil:Date.now() + 30 * 86400000};
      const ip = String(req.headers['x-vercel-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
      const claim = await storeFactory(env).claimCheckout(requestId,record,hmac(JSON.stringify(input)),hmac('checkout-ip:'+ip),input.expectedUnitPrice);
      if (claim.status === 'limited') { res.setHeader('Retry-After','3600'); return reply(429,{error:'Espera un momento antes de crear otro pedido.'}); }
      if (claim.status === 'price_changed') return reply(409,{code:'PRICE_CHANGED',unitPrice:claim.unitPrice,error:'El precio vigente cambió. Revisa el total y confirma nuevamente antes de pagar.'});
      if (claim.status === 'conflict') return reply(409,{error:'La configuración cambió. Inicia nuevamente el pago.'});
      if (!['created','existing'].includes(claim.status) || !claim.order) throw new Error('Order unavailable');
      if (['paid','refunded'].includes(claim.order.paymentStatus)) return reply(409,{error:'Este pedido ya fue procesado. Consulta su resultado antes de volver a pagar.'});
      orderId = claim.order.orderId;
      amount = claim.order.amount;
      unitPrice = claim.order.unitPrice;
      if (![variants.unitPrice,variants.regularPrice].includes(unitPrice) || amount !== unitPrice * variants.kitCount(selection) || claim.order.total !== amount) throw new Error('Invalid persisted amount');
    } catch (_) { return reply(503, {error:'No pudimos guardar tu pedido. Intenta nuevamente.'}); }
    const integritySignature = createHash('sha256').update(`${orderId}${amount}COP${secretKey}`, 'utf8').digest('hex');
    return reply(200, {orderId, amount, unitPrice, currency:'COP', apiKey, integritySignature, tax:'vat-19', description, selection, statusToken:statusToken(orderId)});
  };
}
module.exports = createCheckout();
module.exports.createCheckout = createCheckout;
