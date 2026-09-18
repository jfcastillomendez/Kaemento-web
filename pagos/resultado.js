(() => {
  // Query parameters are untrusted display hints, NEVER proof of payment.
  // Phase 2: confirm via authenticated Bold status API/webhook before fulfillment or purchase analytics.
  // This page intentionally does not emit purchase, generate_lead or send order IDs to Google.
  const status = new URLSearchParams(location.search).get('bold-tx-status');
  const variants = window.KaementoBoldConfig;
  const orderId = new URLSearchParams(location.search).get('bold-order-id');
  try {
    const selections = JSON.parse(sessionStorage.getItem('kaemento-bold-selections') || '{}');
    const stored = /^KAE-MICRO-[A-Za-z0-9_-]{1,50}$/.test(orderId || '') && Object.hasOwn(selections, orderId) ? selections[orderId] : null;
    const selected = stored ? variants.normalize({productId:'microcemento-kaemento-launch',...stored}) : null;
    if (selected) {
      document.getElementById('payment-quantity').textContent = `${selected.quantity} ${selected.quantity === 1 ? 'kit' : 'kits'}`;
      document.getElementById('payment-color').textContent = variants.formula(selected);
      document.getElementById('payment-sealer').textContent = variants.sealers.get(selected.sealer);
      document.getElementById('payment-selection').hidden = false;
      document.getElementById('payment-selection-unavailable').hidden = true;
    }
  } catch (_) { /* Missing/blocked storage must never invent a variant. */ }
  const title = document.getElementById('payment-title');
  const message = document.getElementById('payment-message');
  if (status === 'approved') {
    title.textContent = 'Pago recibido';
    message.textContent = 'Gracias por comprar Microcemento KAEMENTO. Nuestro equipo se pondrá en contacto contigo para coordinar el despacho y el transporte.';
  } else if (['rejected', 'failed'].includes(status)) {
    title.textContent = 'El pago no pudo completarse.';
    message.textContent = 'Puedes intentar nuevamente o consultar con nuestro equipo.';
    document.getElementById('payment-retry').hidden = false;
  }
})();
