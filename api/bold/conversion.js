const payments = require('./_lib/payments.cjs');
function createConversion(env = process.env, storeFactory = payments.createStore) {
  return async function conversion(req, res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    const reply = (code, body) => { res.statusCode=code; res.end(JSON.stringify(body)); };
    if (req.method !== 'POST') { res.setHeader('Allow','POST'); return reply(405,{error:'Método no permitido.'}); }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reply(415,{error:'Solicitud no válida.'});
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return reply(403,{error:'Origen no permitido.'}); }
      catch (_) { return reply(403,{error:'Origen no permitido.'}); }
    }
    let input;
    try {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (Buffer.byteLength(raw || '') > 320) return reply(413,{error:'Solicitud no válida.'});
      input=JSON.parse(raw);
    } catch (_) { return reply(400,{error:'Solicitud no válida.'}); }
    const action=input?.action, key=action === 'prepare' ? 'token' : 'ticket';
    if (!input || Array.isArray(input) || !['prepare','consume'].includes(action) || Object.keys(input).length !== 3 ||
        typeof input.orderId !== 'string' || !/^KAE-MICRO-\d{13}-[a-f0-9]{16}$/.test(input.orderId) ||
        typeof input[key] !== 'string' || !/^[a-f0-9]{64}$/.test(input[key])) return reply(400,{error:'Solicitud no válida.'});
    // Preview/local traffic cannot consume production conversion authorizations.
    if (env.VERCEL_ENV !== 'production' || !payments.enabled(env)) return reply(200,{status:'disabled'});
    try {
      const result=await storeFactory(env).adsConversion(action,input.orderId,input[key]);
      return reply(result.status === 'unavailable' ? 404 : 200,result);
    } catch (_) { return reply(503,{error:'Medición temporalmente no disponible.'}); }
  };
}
module.exports=createConversion(); module.exports.createConversion=createConversion;
