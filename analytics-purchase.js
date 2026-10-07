(() => {
  const seen = new Set();
  const SEND_TO = 'AW-18358591293/UeCLCJPZtpQdEL2-h7JE';
  window.addEventListener('message',async event => {
    if (event.origin !== location.origin || event.source !== parent || !window.kaementoGoogleTagLoaded) return;
    if (event.data?.type === 'kaemento-ads-probe') { parent.postMessage('kaemento-ads-ready',location.origin); return; }
    if (event.data?.type !== 'kaemento-ads-purchase') return;
    const {orderId,ticket}=event.data;
    if (!/^KAE-MICRO-\d{13}-[a-f0-9]{16}$/.test(orderId || '') || !/^[a-f0-9]{64}$/.test(ticket || '') || seen.has(orderId)) return;
    seen.add(orderId);
    try {
      // No client-supplied amount/status/destination can authorize a Google event.
      const response=await fetch('/api/bold/conversion',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'consume',orderId,ticket}),cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok) return;
      const data=await response.json(), p=data.conversion;
      if (data.status !== 'authorized' || p?.send_to !== SEND_TO || p.transaction_id !== orderId || p.currency !== 'COP' ||
          !Number.isSafeInteger(p.value) || p.value <= 0) return;
      gtag('event','conversion',{send_to:SEND_TO,value:p.value,currency:'COP',transaction_id:orderId});
      // "issued" means a one-time handoff, not proof that Google attributed a conversion.
    } catch (_) { /* Never retry an ambiguous consume: Google delivery is not transactional. */ }
  });
})();
