(() => {
  // A redirect is only a hint. Paid status comes exclusively from the authenticated webhook.
  // No analytics event, order reference or access token is sent to Google.
  const params=new URLSearchParams(location.search), hint=params.get('bold-tx-status');
  const orderId=params.get('bold-order-id'), variants=window.KaementoBoldConfig;
  const title=document.getElementById('payment-title'), message=document.getElementById('payment-message');
  const refresh=document.getElementById('payment-refresh'), retry=document.getElementById('payment-retry');
  const reference=document.getElementById('payment-reference');
  const money=amount=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(amount);
  let token, timer, tries=0, busy=false, complete=false;
  function renderSelection(selected,amount) {
    const list=document.getElementById('payment-items');list.replaceChildren();
    for(const item of variants.lines(selected)) {
      const row=document.createElement('li');
      row.textContent=`${item.quantity} ${item.quantity===1?'kit':'kits'} · ${variants.formula(item)} · Sellador ${variants.sealers.get(item.sealer)}`;
      list.append(row);
    }
    document.getElementById('payment-total').textContent=money(amount)+' IVA incluido';
    document.getElementById('payment-selection').hidden=false;
    document.getElementById('payment-selection-unavailable').hidden=true;
  }
  try {
    if(/^KAE-MICRO-\d{13}-[a-f0-9]{16}$/.test(orderId||'')) {
      const selected=variants.restore(JSON.parse(sessionStorage.getItem('kaemento-bold-selections')||'{}')[orderId]);
      if(selected)renderSelection(selected,variants.kitCount(selected)*variants.unitPrice);
      token=JSON.parse(sessionStorage.getItem('kaemento-order-access')||'{}')[orderId];
    }
  }catch(_){}
  if(['rejected','failed'].includes(hint)) {
    title.textContent='El pago no pudo completarse.';message.textContent='Consultaremos la confirmación de Bold antes de mostrar el estado definitivo.';
  }
  if(!/^[a-f0-9]{64}$/.test(token||'')) {
    title.textContent='Consulta el estado de tu pedido';
    message.textContent='Esta sesión no tiene acceso a la confirmación del pedido. Revisa el correo de KAEMENTO y el comprobante de Bold, o consulta con nuestro equipo antes de repetir el pago.';
    return;
  }
  refresh.hidden=false;
  async function check() {
    if(busy || complete)return;
    clearTimeout(timer);busy=true;refresh.disabled=true;refresh.setAttribute('aria-busy','true');
    try {
      const response=await fetch('/api/bold/status',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({orderId,token}),cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Status unavailable');
      const data=await response.json(),selected=variants.restore(data.selection);
      if(data.orderId!==orderId || !selected || data.currency!=='COP' || !Number.isSafeInteger(data.amount) || data.amount<=0)throw new Error('Invalid status');
      renderSelection(selected,data.amount);reference.textContent='Pedido '+data.orderId;reference.hidden=false;
      retry.hidden=true;
      if(data.paymentStatus==='paid') {
        title.textContent='Pago aprobado';message.textContent='Tu pedido está confirmado. Te enviaremos el detalle por correo y coordinaremos contigo el despacho y el transporte. Conserva tu número de pedido.';complete=true;
      }else if(data.paymentStatus==='refunded') {
        title.textContent='Pago anulado';message.textContent='Bold confirmó la anulación de este pago. Consulta con KAEMENTO cualquier duda sobre el pedido.';complete=true;
      }else if(data.paymentStatus==='failed') {
        title.textContent='Pago no aprobado';message.textContent='Bold no aprobó este intento. Puedes revisar el comprobante e intentar nuevamente.';retry.hidden=false;
      }else {
        title.textContent='Estamos verificando tu pago';message.textContent='Esperamos la confirmación de Bold. No necesitas volver a pagar; actualizaremos el estado aquí y recibirás un correo cuando se confirme.';
      }
    }catch(_) {
      message.textContent='No pudimos actualizar el estado en este momento. Usa “Actualizar estado” o consulta con KAEMENTO antes de repetir el pago.';
    }finally {
      busy=false;refresh.disabled=false;refresh.removeAttribute('aria-busy');refresh.hidden=complete;
      if(!complete && ++tries<24 && !document.hidden)timer=setTimeout(check,5000);
    }
  }
  refresh.addEventListener('click',()=>{tries=0;check();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(timer);if(!document.hidden && tries<24)check();});
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  check();
})();
