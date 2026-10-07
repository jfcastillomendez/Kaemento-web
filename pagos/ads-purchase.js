(() => {
  // The result page calls this only after /status says paid. Redis rechecks independently.
  const attempts = new Set();
  window.kaementoMeasurePaidOrder = async (orderId, token) => {
    if (attempts.has(orderId) || !/^KAE-MICRO-\d{13}-[a-f0-9]{16}$/.test(orderId || '') || !/^[a-f0-9]{64}$/.test(token || '')) return;
    attempts.add(orderId);
    let frame;
    const ready = await new Promise(resolve => {
      let probe, timeout;
      function finish(value) { clearInterval(probe); clearTimeout(timeout); window.removeEventListener('message',listen); resolve(value); }
      function listen(event) {
        if (event.origin === location.origin && event.source === frame?.contentWindow && event.data === 'kaemento-ads-ready') finish(true);
      }
      function check() {
        frame=document.querySelector('iframe[src^="/analytics-bridge.html"]');
        frame?.contentWindow.postMessage({type:'kaemento-ads-probe'},location.origin);
      }
      window.addEventListener('message',listen);
      probe=setInterval(check,500); timeout=setTimeout(()=>finish(false),15000); check();
    });
    if (!ready) return; // A blocked Google tag does not consume the durable authorization.
    try {
      const response=await fetch('/api/bold/conversion',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'prepare',orderId,token}),cache:'no-store',signal:AbortSignal.timeout(10000)});
      if (!response.ok) return;
      const data=await response.json();
      if (data.status !== 'prepared' || data.orderId !== orderId || !/^[a-f0-9]{64}$/.test(data.ticket || '')) return;
      // Google never receives the buyer's status token or customer/shipping details.
      frame.contentWindow.postMessage({type:'kaemento-ads-purchase',orderId,ticket:data.ticket},location.origin);
    } catch (_) { /* Measurement failure must never alter the payment result. */ }
  };
})();
