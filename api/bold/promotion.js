const payments = require('./_lib/payments.cjs');
const CAPACITY = 30;
// 2026-09-30: KAEMENTO reported 6 orders; production SCARD contained 2.
// The 4 historical orders are quota accounting only, never fabricated payment records.
const HISTORICAL_ORDERS = 4;
function createPromotion(env = process.env, storeFactory = payments.createStore) {
  return async function promotion(req,res) {
    res.setHeader('Content-Type','application/json');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    const reply = (status,body) => { res.statusCode=status; res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') { res.setHeader('Allow','GET'); return reply(405,{error:'Método no permitido.'}); }
    if (!payments.enabled(env)) return reply(503,{error:'Disponibilidad temporalmente no disponible.'});
    try {
      const confirmed = await storeFactory(env).confirmedCampaignOrders();
      if (!Number.isSafeInteger(confirmed) || confirmed < 0) throw new Error('Invalid count');
      // Public aggregate only: no references, buyers, amounts or payment identifiers.
      res.setHeader('Cache-Control','public, max-age=0, s-maxage=15, stale-while-revalidate=15');
      return reply(200,{capacity:CAPACITY,remaining:Math.max(0,CAPACITY-HISTORICAL_ORDERS-confirmed)});
    } catch (_) { return reply(503,{error:'Disponibilidad temporalmente no disponible.'}); }
  };
}
module.exports = createPromotion();
module.exports.createPromotion = createPromotion;
