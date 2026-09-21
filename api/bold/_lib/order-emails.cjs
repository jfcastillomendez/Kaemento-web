const variants = require('../../../bold-config.js');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',maximumFractionDigits:0}).format(value) + ' COP';
const date = value => new Intl.DateTimeFormat('es-CO', {dateStyle:'long',timeStyle:'short',timeZone:'America/Bogota'}).format(new Date(value));

function emailContent(order, role) {
  if (order.paymentStatus !== 'paid' || order.schemaVersion !== 2 || !order.paidAt) throw new Error('Order not confirmed');
  const sales = role === 'sales';
  if (!sales && role !== 'customer') throw new Error('Invalid email role');
  const subject = sales ? `NUEVA VENTA ONLINE — KAEMENTO — ${order.orderId}` : `Tu pedido KAEMENTO está confirmado — ${order.orderId}`;
  const title = sales ? 'NUEVA VENTA ONLINE' : 'Gracias por tu compra.';
  const intro = sales ? 'Estado: PAGO APROBADO' : 'Tu pedido de Microcemento KAEMENTO fue recibido correctamente y tu pago fue aprobado.';
  const sections = [
    ['Pedido', [['Número de pedido',order.orderId],['Fecha',date(order.paidAt)]]],
    ['Producto', [['Producto','Microcemento KAEMENTO'],['Cantidad',`${order.quantity} ${order.quantity === 1 ? 'kit' : 'kits'}`],
      ['Color / mezcla',variants.formula(order.selection)],['Sellador',variants.sealers.get(order.sealer)],
      ...(sales ? [['Precio unitario',money(order.unitPrice)]] : []),['Total',money(order.total)]]],
    ...(sales ? [['Cliente', [['Nombre / Razón social',order.customerName],['Identificación / NIT',`${order.customerDocumentType} ${order.customerDocument}`],
      ['Email',order.customerEmail],['Teléfono',order.customerPhone]]]] : []),
    ['Entrega', [['Ciudad',order.shippingCity],['Dirección',order.shippingAddress]]],
    ...(sales ? [['Pago', [['Payment ID Bold',order.boldPaymentId],['Medio de pago',order.paymentMethod || 'No informado por Bold'],['Estado Bold',order.boldStatus]]]] : [])
  ];
  const notes = sales ? [] : ['Despacho máximo: 48 horas hábiles.', 'Envíos a todo Colombia.',
    'El transporte no está incluido y su valor es asumido por el cliente.', 'Conserva tu número de pedido para cualquier consulta.'];
  const text = [title,intro,...sections.flatMap(([heading,rows])=>[heading,...rows.map(([k,v])=>`${k}: ${v}`)]),...notes,
    'KAEMENTO S.A.S. · kaemento@gmail.com · +57 300 367 1548', 'https://www.kaemento.com'].join('\n\n');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;background:#f5f5f3;color:#222;font-family:Arial,sans-serif;line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-top:4px solid #ae8851">
<tr><td style="padding:28px 22px"><div style="color:#94703b;letter-spacing:4px;font-size:18px">KAEMENTO</div>
<h1 style="font-size:23px;line-height:1.3;margin:22px 0 12px">${escape(title)}</h1><p>${escape(intro)}</p>
${sections.map(([heading,rows])=>`<h2 style="font-size:16px;color:#856535;border-bottom:1px solid #eee;padding-bottom:8px;margin-top:26px">${escape(heading)}</h2>
${rows.map(([k,v])=>`<p style="margin:9px 0;overflow-wrap:anywhere;word-break:break-word"><strong>${escape(k)}:</strong> ${escape(v)}</p>`).join('')}`).join('')}
${notes.map(note=>`<p style="margin:14px 0">${escape(note)}</p>`).join('')}
<p style="margin-top:30px;border-top:1px solid #eee;padding-top:20px;font-size:13px;color:#555">KAEMENTO S.A.S.<br>
<a href="mailto:kaemento@gmail.com" style="color:#856535">kaemento@gmail.com</a><br>
<a href="https://wa.me/573003671548" style="color:#856535">+57 300 367 1548</a><br>
<a href="https://www.kaemento.com" style="color:#856535">www.kaemento.com</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return {subject, html, text};
}
function emailConfig(env) {
  const addresses = (env.KAEMENTO_SALES_EMAIL || '').split(',').map(x=>x.trim()).filter(Boolean);
  const address = /^[^\s<>@,]+@[^\s<>@,]+\.[^\s<>@,]+$/;
  const from = env.KAEMENTO_EMAIL_FROM?.trim();
  // Only enable after verifying the sender domain in Resend. No inferred/from-Gmail sender.
  if (env.KAEMENTO_EMAIL_ENABLED !== 'true' || !env.RESEND_API_KEY?.trim() || !from || /[\r\n]/.test(from) ||
      !address.test(from.match(/<([^<>]+)>$/)?.[1] || from) || addresses.length < 1 || addresses.length > 5 || addresses.some(x=>!address.test(x))) return null;
  return {from, sales:[...new Set(addresses.map(x=>x.toLowerCase()))]};
}
function emailPayload(order, role, config) {
  return {from:config.from, to:role === 'sales' ? config.sales : [order.customerEmail],
    reply_to:'kaemento@gmail.com', ...emailContent(order, role)};
}
async function sendEmail(payload, key, env, transport = fetch) {
  try {
    const response = await transport('https://api.resend.com/emails', {
      method:'POST', redirect:'error', signal:AbortSignal.timeout(8000),
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${env.RESEND_API_KEY}`, 'Idempotency-Key':key},
      body:typeof payload === 'string' ? payload : JSON.stringify(payload)
    });
    if (!response.ok) return {ok:false,errorCode:response.status === 429 ? 'provider_rate_limited' : response.status >= 500 ? 'provider_unavailable' : 'provider_rejected'};
    const result = await response.json();
    if (typeof result.id !== 'string' || !/^[a-zA-Z0-9_-]{1,120}$/.test(result.id)) return {ok:false,errorCode:'provider_response_invalid'};
    return {ok:true,providerId:result.id};
  } catch (_) { return {ok:false,errorCode:'provider_unavailable'}; }
}
async function deliverOrder(orderId, store, env = process.env, transport = fetch, force = false) {
  const order = await store.readOrder(orderId);
  if (!order || order.paymentStatus !== 'paid' || order.schemaVersion !== 2) return [];
  const config = emailConfig(env), results = [];
  for (const role of ['sales', 'customer']) {
    const payload = config ? emailPayload(order, role, config) : null;
    const claim = await store.claimEmail(orderId, role, payload, force);
    if (claim.status !== 'claimed') { results.push({role,status:claim.status}); continue; }
    const result = config && claim.job.payload ? await sendEmail(claim.job.payload,
      `kaemento-paid/${orderId}/${role}/v1`, env, transport) : {ok:false,errorCode:'email_not_configured'};
    const status = await store.finishEmail(orderId, role, claim.job.leaseToken, result);
    results.push({role,status});
  }
  return results;
}
module.exports = {emailContent, emailConfig, emailPayload, sendEmail, deliverOrder};
