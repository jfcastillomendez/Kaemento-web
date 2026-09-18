(() => {
  // Query parameters are untrusted display hints, NEVER proof of payment.
  // Phase 2: confirm via authenticated Bold status API/webhook before fulfillment or purchase analytics.
  // This page intentionally does not emit purchase, generate_lead or send order IDs to Google.
  const status = new URLSearchParams(location.search).get('bold-tx-status');
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
