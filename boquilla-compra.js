(() => {
  const panel=document.getElementById('consultar-boquilla');
  if (!panel) return;
  const variants=window.KaementoBoldConfig, price=variants.boquillaPrice;
  const color=panel.querySelector('[data-boquilla-color]'), quantity=panel.querySelector('[data-boquilla-quantity]');
  const add=panel.querySelector('[data-boquilla-add]'), buy=panel.querySelector('[data-boquilla-buy]'), status=panel.querySelector('[data-boquilla-status]');
  const list=panel.querySelector('[data-boquilla-cart]'), total=panel.querySelector('[data-boquilla-total]');
  const money=n=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(n);
  const storageKey='kaemento-boquilla-cart-v1';
  let busy=false, visit=0, sdkPromise, items=[];
  const attempts=new Map();
  try {items=variants.restore(JSON.parse(localStorage.getItem(storageKey)||'null'))?.items || [];}catch(_){}
  function selection() {return variants.normalizeBoquilla({productId:'boquilla-magica',items});}
  function save() {try {if(items.length)localStorage.setItem(storageKey,JSON.stringify(selection()));else localStorage.removeItem(storageKey);}catch(_) {}}
  function refresh() {
    const selected=selection();list.replaceChildren();
    if(!selected){const empty=document.createElement('li');empty.textContent='Tu carrito está vacío. Elige un color y agrégalo.';list.append(empty);}
    for(const item of items) {
      const row=document.createElement('li'), label=document.createElement('label'), input=document.createElement('input'), remove=document.createElement('button');
      label.textContent=variants.boquillaColors.get(item.color)+' · '+money(price)+'/kit';
      input.type='number';input.min='1';input.step='1';input.value=String(item.quantity);input.disabled=busy;
      input.setAttribute('aria-label','Kits de '+variants.boquillaColors.get(item.color));
      input.addEventListener('change',()=>{
        if(!variants.validQuantity(Number(input.value)) || !input.reportValidity()){input.value=String(item.quantity);return;}
        const previous=item.quantity;item.quantity=Number(input.value);
        if(!selection()){item.quantity=previous;input.value=String(previous);return;}save();refresh();
      });
      remove.type='button';remove.textContent='Quitar';remove.disabled=busy;remove.setAttribute('aria-label','Quitar '+variants.boquillaColors.get(item.color));
      remove.addEventListener('click',()=>{items=items.filter(x=>x!==item);save();refresh();});
      label.append(input);row.append(label,remove);list.append(row);
    }
    total.textContent=selected ? 'Total: '+money(variants.kitCount(selected)*price)+' IVA incluido' : '';
    buy.disabled=busy || !selected;add.disabled=color.disabled=quantity.disabled=busy;
  }
  add.addEventListener('click',()=>{
    if(busy || !quantity.reportValidity() || !variants.validQuantity(Number(quantity.value)))return;
    const draft=items.map(x=>({...x})), existing=draft.find(x=>x.color===color.value);
    if(existing)existing.quantity+=Number(quantity.value);else draft.push({color:color.value,quantity:Number(quantity.value)});
    const selected=variants.normalizeBoquilla({productId:'boquilla-magica',items:draft});
    if(!selected)return;items=selected.items;save();refresh();status.textContent='Agregado al carrito. Puedes añadir otro color o continuar al pago.';
  });
  window.addEventListener('storage',event=>{if(event.key!==storageKey || busy)return;try {items=variants.restore(JSON.parse(event.newValue||'null'))?.items||[];}catch(_){items=[];}refresh();});
  window.addEventListener('pagehide',()=>{visit++;attempts.clear();});
  window.addEventListener('pageshow',()=>{try {items=variants.restore(JSON.parse(localStorage.getItem(storageKey)||'null'))?.items||[];}catch(_){}refresh();});
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
    busy=true;refresh();const activeVisit=visit;
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
        if(result.amount!==variants.kitCount(selected)*price || result.unitPrice!==price || result.currency!=='COP' || result.tax!=='vat-19' || JSON.stringify(result.selection)!==JSON.stringify(selected) || !/^KAE-BOQUILLA-\d{13}-[a-f0-9]{16}$/.test(result.orderId || '') || !/^[a-f0-9]{64}$/.test(result.integritySignature || '') || !/^[a-f0-9]{64}$/.test(result.statusToken || '') || typeof result.apiKey!=='string' || !result.apiKey)throw new Error('Invalid order');
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
    finally {busy=false;refresh();}
  });
  refresh();
})();
