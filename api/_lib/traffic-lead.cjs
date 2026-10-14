// Product-specific payload; delivery, rate limits and Redis leases stay in red-kaemento.
const projects = {parqueadero:'Parqueadero',conjunto:'Conjunto residencial',bodega:'Bodega / centro logístico',industria:'Zona industrial',via:'Vía interna',accesible:'Estacionamiento accesible',otro:'Otro proyecto'};
const colors = {amarillo:'Amarillo',blanco:'Blanco',negro:'Negro',azul:'Azul',varios:'Varios / por definir'};
const clean = (v,min,max) => typeof v==='string' && v.length<=max && !/[\x00-\x1f\x7f<>]/.test(v) && v.trim().length>=min ? v.trim() : null;
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normalize(body) {
  const keys=['requestId','kind','name','business','city','project','area','color','phone','privacyAccepted','website'];
  if(!body || body.kind!=='cotizacion-trafico' || Object.keys(body).length!==keys.length || keys.some(k=>!Object.hasOwn(body,k)))return null;
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(body.requestId||'') || body.privacyAccepted!==true || body.website!=='')return null;
  const name=clean(body.name,2,120),business=clean(body.business,0,160),city=clean(body.city,2,100),phone=clean(body.phone,7,25);
  if(!name || business===null || !city || !phone || !/^\+?\d{7,15}$/.test(phone.replace(/[ ().-]/g,'')))return null;
  if(!Object.hasOwn(projects,body.project) || !Object.hasOwn(colors,body.color) || typeof body.area!=='number' || !Number.isFinite(body.area) || body.area<=0 || body.area>10000000 || Math.abs(body.area*100-Math.round(body.area*100))>1e-6)return null;
  return {requestId:body.requestId,kind:body.kind,name,business,city,project:body.project,area:body.area,color:body.color,phone,privacyAccepted:true};
}
function payload(data,config) {
  const rows=[['Producto','Pintura de Tráfico KAEMENTO'],['Nombre',data.name],['Empresa / conjunto',data.business||'Particular'],['Ciudad',data.city],['Tipo de proyecto',projects[data.project]],['Área aproximada',data.area+' m²'],['Color solicitado',colors[data.color]],['Teléfono / WhatsApp',data.phone],['Origen','https://www.kaemento.com/pintura-de-trafico'],['Consentimiento','Autorizó el tratamiento de datos para gestionar esta cotización'],['Referencia',data.requestId]];
  return {from:config.from,to:config.sales,subject:'COTIZACIÓN — PINTURA DE TRÁFICO KAEMENTO',text:rows.map(([k,v])=>`${k}: ${v}`).join('\n\n'),html:`<div style="font-family:Arial,sans-serif;line-height:1.6;color:#282722;max-width:640px"><h1 style="font-size:24px">Cotización · Pintura de Tráfico KAEMENTO</h1>${rows.map(([k,v])=>`<p><strong>${escape(k)}:</strong> ${escape(v)}</p>`).join('')}</div>`};
}
module.exports={normalize,payload};
