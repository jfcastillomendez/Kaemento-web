const payments = require('./_lib/payments.cjs');
const campaign = require('../../microcemento-launch-config.js');
const CAPACITY = campaign.maxOrders, HISTORICAL_ORDERS = campaign.historicalOrders;
function createPromotion(env = process.env, storeFactory = payments.createStore, clock = Date.now) {
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
      const remaining = Math.max(0,CAPACITY-HISTORICAL_ORDERS-confirmed);
      const state = !campaign.enabled || clock() >= Date.parse(campaign.endsAt) ? 'ended' : clock() < Date.parse(campaign.startsAt) ? 'upcoming' : remaining === 0 ? 'sold_out' : 'active';
      return reply(200,{capacity:CAPACITY,remaining,state,endsAt:campaign.endsAt});
    } catch (_) { return reply(503,{error:'Disponibilidad temporalmente no disponible.'}); }
  };
}
module.exports = createPromotion();
module.exports.createPromotion = createPromotion;
