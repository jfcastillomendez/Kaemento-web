(() => {
  const panel=document.getElementById('comprar-trafico');
  if (!panel) return;
  const variants=window.KaementoBoldConfig, price=variants.trafficPrice;
  const yellow=panel.querySelector('[name="amarillo"]'), black=panel.querySelector('[name="negro"]');
  const buy=panel.querySelector('[data-traffic-buy]'), status=panel.querySelector('[role="status"]');
  const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
  let busy=false, visit=0, sdkPromise;
  const attempts=new Map();
  function selection() {
    const items=[];
    for (const input of [yellow,black]) {
      const quantity=Number(input.value);
      if (!/^\d+$/.test(input.value) || quantity<0 || !Number.isSafeInteger(quantity)) return null;
      if (quantity) items.push({color:input.name,quantity});
    }
    return variants.normalizeTraffic({productId:'pintura-trafico',items});
  }
  function refresh() {
    const s=selection();
    panel.querySelector('[data-traffic-total]').textContent=s ? money(variants.kitCount(s)*price)+' IVA incluido' : 'Selecciona la cantidad de galones';
    buy.disabled=busy || !s;
  }
  [yellow,black].forEach(input=>input.addEventListener('input',refresh));
  function clear() {visit++;yellow.value='0';black.value='0';attempts.clear();status.textContent='';refresh();}
  window.addEventListener('pagehide',clear);
  window.addEventListener('pageshow',e=>{if(e.persisted)clear();});
  function loadSdk() {
    if (typeof window.BoldCheckout==='function') return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://checkout.bold.co/library/boldPaymentButton.js';script.async=true;
      const timer=setTimeout(()=>finish(false),15000);
      function finish(ok) {clearTimeout(timer);script.onload=script.onerror=null;if(ok && typeof window.BoldCheckout==='function')resolve();else{script.remove();sdkPromise=undefined;reject(new Error('SDK unavailable'));}}
      script.onload=()=>finish(true);script.onerror=()=>finish(false);document.head.append(script);
    });
    return sdkPromise;
  }
  buy.addEventListener('click',async()=>{
    const selected=selection();if(busy || !selected)return;
    busy=true;yellow.disabled=black.disabled=true;refresh();const activeVisit=visit;
    status.textContent='Preparando tu pedido…';
    try {
      const data=await window.KaementoOrderCustomer.open(selected,async customer=>{
        const payload=JSON.stringify({...selected,customer,expectedUnitPrice:price});
        const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload));
        const fingerprint=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
        if(!attempts.has(fingerprint))attempts.set(fingerprint,crypto.randomUUID());
        const response=await fetch('/api/bold/checkout',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempts.get(fingerprint)},body:payload,cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!response.ok){const error=new Error('Checkout unavailable');error.code=({400:'INVALID_CUSTOMER',409:'ORDER_PROCESSED',429:'RATE_LIMITED'})[response.status];throw error;}
        const result=await response.json();
        if(result.amount!==variants.kitCount(selected)*price || result.unitPrice!==price || result.currency!=='COP' || result.tax!=='vat-19' || JSON.stringify(result.selection)!==JSON.stringify(selected) || !/^KAE-TRAFICO-\d{13}-[a-f0-9]{16}$/.test(result.orderId || '') || !/^[a-f0-9]{64}$/.test(result.integritySignature || '') || !/^[a-f0-9]{64}$/.test(result.statusToken || '') || typeof result.apiKey!=='string' || !result.apiKey)throw new Error('Invalid order');
        return result;
      },price);
      if(!data || activeVisit!==visit){status.textContent='';return;}
      for(const [key,value] of [['kaemento-bold-selections',data.selection],['kaemento-order-access',data.statusToken]]) {
        try {const previous=JSON.parse(sessionStorage.getItem(key)||'{}');sessionStorage.setItem(key,JSON.stringify(Object.fromEntries([...Object.entries(previous).slice(-19),[data.orderId,value]])));}catch(_){}
      }
      await loadSdk();if(activeVisit!==visit)return;
      const config={orderId:data.orderId,amount:String(data.amount),currency:data.currency,apiKey:data.apiKey,integritySignature:data.integritySignature,description:data.description,tax:data.tax,redirectionUrl:location.origin+'/pagos/resultado'};
      try {await new window.BoldCheckout({...config,renderMode:'embedded'}).open();}
      catch(_){await new window.BoldCheckout(config).open();}
      status.textContent='Continúa en el pago seguro de Bold.';
    }catch(_){status.textContent='No pudimos abrir el pago. Intenta nuevamente o consulta con KAEMENTO. Si ya pagaste, revisa tu comprobante antes de repetir la compra.';}
    finally {busy=false;yellow.disabled=black.disabled=false;refresh();}
  });
  refresh();
})();
