const {createHash} = require('node:crypto');
const {createStore} = require('./bold/_lib/payments.cjs');
const {emailConfig,sendEmail} = require('./bold/_lib/order-emails.cjs');
const profiles={independiente:'Aplicador independiente',capacitacion:'Capacitación',vinculacion:'Vinculación directa',distribuidor:'Distribuidor',ferreteria:'Ferretería',especializado:'Punto de venta especializado',aliado:'Aliado comercial'};
const areas={microcemento:'Microcemento',fachadas:'Fachadas',impermeabilizacion:'Impermeabilizaciones',obras:'Obras generales'};
const clean=(v,min,max)=>typeof v==='string' && v.length<=max && !/[\x00-\x1f\x7f<>]/.test(v) && v.trim().length>=min ? v.trim() : null;
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normalize(body) {
  if(!body || Array.isArray(body) || !['aplicadores','aliados'].includes(body.kind))return null;
  const keys=['requestId','kind','name','email','phone','city','profile','message','privacyAccepted','website',...(body.kind==='aplicadores'?['areas','experience']:['business'])];
  if(Object.keys(body).length!==keys.length || keys.some(k=>!Object.hasOwn(body,k)) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.requestId || '') || body.privacyAccepted!==true || body.website!=='')return null;
  const name=clean(body.name,2,120),email=clean(body.email,5,160),phone=clean(body.phone,7,25),city=clean(body.city,2,100),message=clean(typeof body.message === 'string' ? body.message.replace(/[\r\n]+/g,' ') : body.message,0,1500);
  if(!name||!email||!phone||!city||message===null||!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(email)||!/^\+?\d{7,15}$/.test(phone.replace(/[ ().-]/g,'')))return null;
  const applicant=body.kind==='aplicadores';
  if(!(applicant?['independiente','capacitacion','vinculacion']:['distribuidor','ferreteria','especializado','aliado']).includes(body.profile))return null;
  const result={requestId:body.requestId,kind:body.kind,name,email:email.toLowerCase(),phone,city,profile:body.profile,message,privacyAccepted:true};
  if(applicant) {
    if(!Array.isArray(body.areas)||!body.areas.length||body.areas.length>4||new Set(body.areas).size!==body.areas.length||body.areas.some(x=>!Object.hasOwn(areas,x))||!['sin-experiencia','menos-1','1-3','mas-3'].includes(body.experience))return null;
    result.areas=[...body.areas].sort();result.experience=body.experience;
  } else {result.business=clean(body.business,2,160);if(!result.business)return null;}
  return result;
}
function payload(data,config) {
  const rows=[['Solicitud',profiles[data.profile]],['Nombre',data.name],['Correo',data.email],['Teléfono',data.phone],['Ciudad',data.city],
    ...(data.kind==='aplicadores'?[['Especialidades',data.areas.map(a=>areas[a]).join(', ')],['Experiencia',({'sin-experiencia':'Quiero aprender','menos-1':'Menos de 1 año','1-3':'1 a 3 años','mas-3':'Más de 3 años'})[data.experience]]]:[['Establecimiento / empresa',data.business]]),
    ['Mensaje',data.message||'Sin comentario adicional'],['Consentimiento','Autorizó el tratamiento de datos para gestionar esta solicitud'],['Referencia',data.requestId]];
  return {from:config.from,to:config.sales,reply_to:data.email,
    subject:`RED KAEMENTO — ${profiles[data.profile]}`,
    text:rows.map(([k,v])=>`${k}: ${v}`).join('\n\n'),
    html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#282722;max-width:640px"><h1 style="color:#94703b;font-size:24px">Nueva solicitud · KAEMENTO</h1>${rows.map(([k,v])=>`<p><strong>${escape(k)}:</strong> ${escape(v)}</p>`).join('')}</div>`};
}
function createHandler(env=process.env,storeFactory=createStore,transport=fetch) {
  return async function handler(req,res) {
    const reply=(code,body)=>{res.statusCode=code;res.end(JSON.stringify(body));};
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST')return reply(405,{error:'Método no permitido.'});
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))return reply(415,{error:'Formato no permitido.'});
    // This endpoint is same-origin only. Preview hosts must match their own Origin too.
    try {if(new URL(req.headers.origin).host!==req.headers.host)return reply(403,{error:'Origen no permitido.'});}catch(_){return reply(403,{error:'Origen no permitido.'});}
    let data;
    try {const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body);if(Buffer.byteLength(raw||'')>8192)return reply(413,{error:'Solicitud demasiado larga.'});data=normalize(JSON.parse(raw));}catch(_){}
    if(!data)return reply(400,{error:'Revisa los datos obligatorios y la autorización.'});
    const config=emailConfig(env);if(!config)return reply(503,{error:'El envío no está disponible. Intenta más tarde o escríbenos a kaemento@gmail.com.'});
    try {
      const store=storeFactory(env),mail=payload(data,config);
      const ip=String(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'local').split(',')[0].trim();
      const hash=value=>createHash('sha256').update(value).digest('hex');
      const claim=await store.claimNetwork(data.requestId,hash(JSON.stringify(data)),mail,hash(ip));
      if(claim.status==='sent')return reply(200,{ok:true});
      if(claim.status==='limited')return reply(429,{error:'Has alcanzado el límite de solicitudes. Intenta más tarde.'});
      if(claim.status!=='claimed')return reply(409,{error:'La solicitud está en proceso o debe revisarse. Conserva tus datos e intenta más tarde.'});
      const sent=await sendEmail(claim.payload,'kaemento-network/'+data.requestId,env,transport);
      const status=await store.finishNetwork(data.requestId,claim.leaseToken,sent.ok);
      if(status!=='sent')return reply(503,{error:'No se pudo confirmar el envío. Conservamos esta solicitud para que puedas reintentarlo sin duplicarla.'});
      return reply(200,{ok:true});
    } catch (_) {return reply(503,{error:'No pudimos confirmar el envío. Reintenta con los mismos datos en un momento.'});}
  };
}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.normalize=normalize;
