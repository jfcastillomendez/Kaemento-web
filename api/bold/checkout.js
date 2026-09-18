const { createHash, randomBytes } = require('node:crypto');

// Price, currency and tax are authoritative on the server. No customer data here.
const PRODUCT_ID = 'microcemento-kaemento-launch';
const UNIT_AMOUNT = 365500;
const CURRENCY = 'COP';
const DESCRIPTION = 'Microcemento KAEMENTO - Kit completo - Lanzamiento';

module.exports = function checkout(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return reply(405, { error: 'Método no permitido.' });
  }
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    return reply(415, { error: 'Solicitud no válida.' });
  }
  let body = req.body;
  try {
    if (typeof body === 'string') {
      if (Buffer.byteLength(body) > 1024) return reply(413, { error: 'Solicitud no válida.' });
      body = JSON.parse(body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 2 || body.productId !== PRODUCT_ID ||
        !Object.hasOwn(body, 'quantity') || !Number.isInteger(body.quantity) ||
        body.quantity < 1 || body.quantity > 20) {
      return reply(400, { error: 'Selecciona entre 1 y 20 kits.' });
    }
    const apiKey = process.env.BOLD_IDENTITY_KEY;
    const secretKey = process.env.BOLD_SECRET_KEY;
    if (!apiKey?.trim() || !secretKey?.trim()) {
      return reply(503, { error: 'El pago no está disponible en este momento.' });
    }
    const amount = UNIT_AMOUNT * body.quantity; // COP total, VAT already included.
    const orderId = `KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`;
    const integritySignature = createHash('sha256')
      .update(`${orderId}${amount}${CURRENCY}${secretKey}`, 'utf8').digest('hex');
    return reply(200, { orderId, amount, currency: CURRENCY, apiKey,
      integritySignature, tax: 'vat-19', description: DESCRIPTION });
  } catch (_) {
    // Never log the request, environment, signature input or provider credentials.
    return reply(400, { error: 'No pudimos preparar el pago. Intenta nuevamente.' });
  }
};
