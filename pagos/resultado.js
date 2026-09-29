(() => {
  // Query parameters are untrusted display hints, NEVER proof of payment.
  // Only the authenticated server webhook can confirm payment; this return cannot.
  // This page intentionally does not emit purchase, generate_lead or send order IDs to Google.
  const status = new URLSearchParams(location.search).get('bold-tx-status');
  const variants = window.KaementoBoldConfig;
  const orderId = new URLSearchParams(location.search).get('bold-order-id');
  try {
    const selections = JSON.parse(sessionStorage.getItem('kaemento-bold-selections') || '{}');
    const stored = /^KAE-MICRO-[A-Za-z0-9_-]{1,50}$/.test(orderId || '') && Object.hasOwn(selections, orderId) ? selections[orderId] : null;
    const selected = stored ? variants.restore(stored) : null;
    if (selected) {
      const list=document.getElementById('payment-items');
      for(const item of variants.lines(selected)) {
        const row=document.createElement('li');
        row.textContent=`${item.quantity} ${item.quantity === 1 ? 'kit' : 'kits'} · ${variants.formula(item)} · Sellador ${variants.sealers.get(item.sealer)}`;
        list.append(row);
      }
      document.getElementById('payment-total').textContent=new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(variants.kitCount(selected)*variants.unitPrice)+' IVA incluido';
      document.getElementById('payment-selection').hidden = false;
      document.getElementById('payment-selection-unavailable').hidden = true;
    }
  } catch (_) { /* Missing/blocked storage must never invent a variant. */ }
  const title = document.getElementById('payment-title');
  const message = document.getElementById('payment-message');
  if (status === 'approved') {
    title.textContent = 'Pago pendiente de verificación';
    message.textContent = 'Estamos verificando el resultado con Bold. Una vez confirmado el pago, nuestro equipo coordinará contigo el despacho y el transporte.';
  } else if (['rejected', 'failed'].includes(status)) {
    title.textContent = 'El pago no pudo completarse.';
    message.textContent = 'Puedes intentar nuevamente o consultar con nuestro equipo.';
    document.getElementById('payment-retry').hidden = false;
  }
})();
