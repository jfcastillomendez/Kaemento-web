const { createHash, randomBytes } = require('node:crypto');
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
    const {selection, customer} = input;
    const description = variants.orderDescription(selection);
    if (description.length > 100) return reply(400, {error:'Selección no válida.'});
    const apiKey = env.BOLD_IDENTITY_KEY, secretKey = env.BOLD_SECRET_KEY;
    if (!apiKey?.trim() || !secretKey?.trim() || !payments.enabled(env)) {
      return reply(503, {error:'El pago no está disponible en este momento.'});
    }
    const amount = orders.UNIT_PRICE * variants.kitCount(selection);
    const orderId = `KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`;
    try {
      // Never issue a payable signature without a durable, complete order.
      await storeFactory(env).saveOrder(payments.orderRecord(orderId, selection, customer));
    } catch (_) { return reply(503, {error:'No pudimos guardar tu pedido. Intenta nuevamente.'}); }
    const integritySignature = createHash('sha256').update(`${orderId}${amount}COP${secretKey}`, 'utf8').digest('hex');
    return reply(200, {orderId, amount, currency:'COP', apiKey, integritySignature, tax:'vat-19', description, selection});
  };
}
module.exports = createCheckout();
module.exports.createCheckout = createCheckout;
