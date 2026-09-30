const {createHash, timingSafeEqual} = require('node:crypto');
const payments = require('./_lib/payments.cjs');
function createStatus(env=process.env, storeFactory=payments.createStore, clock=Date.now) {
  return async function status(req,res) {
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
    const reply=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
    if(req.method!=='POST'){res.setHeader('Allow','POST');return reply(405,{error:'Método no permitido.'});}
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(415,{error:'Solicitud no válida.'});
    let input;
    try {
      const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);
      if(Buffer.byteLength(raw||'')>256)return reply(413,{error:'Solicitud no válida.'});
      input=JSON.parse(raw);
    }catch(_){return reply(400,{error:'Solicitud no válida.'});}
    if(!input || Array.isArray(input) || Object.keys(input).length!==2 || typeof input.orderId!=='string' || typeof input.token!=='string' || !/^KAE-MICRO-\d{13}-[a-f0-9]{16}$/.test(input.orderId||'') || !/^[a-f0-9]{64}$/.test(input.token||''))return reply(400,{error:'Solicitud no válida.'});
    if(!payments.enabled(env))return reply(503,{error:'Consulta temporalmente no disponible.'});
    try {
      const order=await storeFactory(env).readOrder(input.orderId);
      const expected=order?.statusTokenHash;
      if(!/^[a-f0-9]{64}$/.test(expected||'') || !(order.statusAccessUntil>clock()) ||
        !timingSafeEqual(Buffer.from(expected,'hex'),createHash('sha256').update(input.token).digest()))return reply(404,{error:'Pedido no disponible para esta sesión.'});
      // A strict projection: no buyer details, address, email, phone, provider IDs or payment data.
      return reply(200,{orderId:order.orderId,paymentStatus:['paid','failed','refunded'].includes(order.paymentStatus)?order.paymentStatus:'pending',
        selection:order.selection,amount:order.amount,currency:order.currency,paidAt:order.paidAt||null});
    }catch(_){return reply(503,{error:'Consulta temporalmente no disponible.'});}
  };
}
module.exports=createStatus();module.exports.createStatus=createStatus;
