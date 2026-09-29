(() => {
  if (window.kaementoBoldInitialized) return;
  window.kaementoBoldInitialized = true;
  const sdkUrl = 'https://checkout.bold.co/library/boldPaymentButton.js';
  const variants = window.KaementoBoldConfig;
  const unitAmount = 365500;
  const format = amount => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
  const errorText = 'No pudimos abrir el pago en este momento. Intenta nuevamente o contáctanos por WhatsApp.';
  let sdkPromise;
  let customerPromise;
  let preparing = false;
  function loadCustomerStep() {
    if (customerPromise) return customerPromise;
    customerPromise = Promise.all([
      ['script','/order-customer.js'], ['link','/order-customer.css']
    ].map(([tag,url])=>new Promise((resolve,reject)=>{
      const element = document.createElement(tag);
      if (tag === 'script') element.src = url;
      else { element.rel = 'stylesheet'; element.href = url; }
      element.onload = resolve;
      element.onerror = () => { element.remove(); customerPromise = undefined; reject(new Error('Order form unavailable')); };
      document.head.appendChild(element);
    })));
    return customerPromise;
  }
  function loadSdk() {
    if (typeof window.BoldCheckout === 'function') return Promise.resolve();
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise((resolve, reject) => {
      let script = document.querySelector(`script[src="${sdkUrl}"]`);
      const fresh = !script;
      if (!script) { script = document.createElement('script'); script.src = sdkUrl; script.async = true; }
      const timer = setTimeout(() => finish(false), 15000);
      function finish(ok) {
        clearTimeout(timer);
        script.removeEventListener('load', loaded);
        script.removeEventListener('error', failed);
        if (ok && typeof window.BoldCheckout === 'function') resolve();
        else { script.remove(); sdkPromise = undefined; reject(new Error('Checkout unavailable')); }
      }
      const loaded = () => finish(true);
      const failed = () => finish(false);
      script.addEventListener('load', loaded, { once: true });
      script.addEventListener('error', failed, { once: true });
      if (fresh) document.head.appendChild(script);
    });
    return sdkPromise;
  }
  document.querySelectorAll('[data-bold-purchase]').forEach(panel => {
    const input = panel.querySelector('[data-bold-quantity]');
    const colorInput = panel.querySelector('[data-bold-color]');
    const mode = panel.querySelector('[data-bold-mode]');
    const tone1 = panel.querySelector('[data-bold-tone1]');
    const tone2 = panel.querySelector('[data-bold-tone2]');
    const ratio = panel.querySelector('[data-bold-ratio]');
    const formula = panel.querySelector('[data-bold-formula]');
    const sealerInput = panel.querySelector('[data-bold-sealer]');
    const add = panel.querySelector('[data-cart-add]');
    const cancelEdit = panel.querySelector('[data-cart-cancel]');
    const cartList = panel.querySelector('[data-cart-list]');
    const cartTotal = panel.querySelector('[data-cart-total]');
    const cartMessage = panel.querySelector('[data-cart-message]');
    const storageKey = 'kaemento-microcemento-cart-v1';
    let items = [], editing = -1;
    try { items = variants.restore(JSON.parse(localStorage.getItem(storageKey)))?.items || []; } catch (_) {}
    const button = panel.querySelector('[data-bold-buy]');
    const status = panel.querySelector('[data-bold-status]');
    const total = panel.querySelector('[data-bold-total]');
    const contact = panel.querySelector('[data-bold-help]');
    function quantity() {
      const n = Number(input.value);
      return /^\d+$/.test(input.value) && Number.isInteger(n) && n >= 1 && n <= 20 ? n : null;
    }
    input.addEventListener('input', () => {
      const n = quantity();
      input.setCustomValidity(n ? '' : 'Selecciona un número entero entre 1 y 20.');
      total.textContent = n ? format(n * unitAmount) : '—';
    });
    const variantControls = [mode, colorInput, tone1, tone2, ratio, sealerInput];
    function requestBody(n) {
      const base = {productId:'microcemento-kaemento-launch',quantity:n,colorMode:mode.value,sealer:sealerInput.value};
      return mode.value === 'standard' ? {...base,color:colorInput.value} : {...base,color1:tone1.value,color2:tone2.value,percentage1:Number(ratio.value),percentage2:100-Number(ratio.value)};
    }
    function refresh() {
      const mix = mode.value === 'mix', standard = mode.value === 'standard';
      panel.querySelector('[data-bold-standard]').hidden = !standard;
      panel.querySelector('[data-bold-mix]').hidden = !mix;
      colorInput.disabled = !standard;
      for (const field of [tone1,tone2,ratio]) field.disabled = !mix;
      tone2.setCustomValidity(mix && tone1.value && tone1.value === tone2.value ? 'Elige dos tonos diferentes.' : '');
      for (const opt of tone2.options) if (opt.value) opt.disabled = opt.value === tone1.value;
      for (const opt of tone1.options) if (opt.value) opt.disabled = opt.value === tone2.value;
      const s = variants.normalize({...requestBody(1),sealer:'mate'});
      formula.textContent = s ? variants.formula(s) : mix ? 'Selecciona dos tonos diferentes y su proporción.' : standard ? 'Selecciona el color estándar.' : 'Selecciona la modalidad de color.';
    }
    variantControls.forEach(field => field.addEventListener('change',refresh));
    refresh();
    function saveCart() {
      try { localStorage.setItem(storageKey,JSON.stringify({items})); } catch (_) { cartMessage.textContent = 'Tu navegador no permite guardar el carrito. Mantenlo abierto hasta finalizar.'; }
    }
    function renderCart() {
      cartList.replaceChildren();
      items.forEach((item,index)=>{
        const row=document.createElement('li'); row.className='kae-cart-line';
        const summary=document.createElement('div'), name=document.createElement('strong'), detail=document.createElement('p');
        name.textContent=variants.formula(item); detail.textContent='Sellador '+variants.sealers.get(item.sealer)+' · '+format(unitAmount)+' / kit';
        summary.append(name,detail);
        const controls=document.createElement('div'); controls.className='kae-cart-controls';
        const label=document.createElement('label'); label.textContent='Kits';
        const qty=document.createElement('input'); qty.type='number'; qty.min='1';qty.max='20';qty.step='1';qty.required=true;qty.inputMode='numeric';qty.value=String(item.quantity);
        qty.setAttribute('aria-label','Cantidad de '+variants.formula(item)+' · '+variants.sealers.get(item.sealer));
        qty.addEventListener('input',()=>{
          const n=Number(qty.value), candidate=items.map((x,i)=>({...x,quantity:i===index?n:x.quantity}));
          const valid=variants.restore({items:candidate});
          if (!valid) {qty.setCustomValidity('El pedido admite entre 1 y 20 kits en total, en cantidades enteras.');button.disabled=true;cartMessage.textContent=qty.validationMessage;return;}
          qty.setCustomValidity('');items=valid.items;saveCart();
          subtotal.textContent=format(n*unitAmount);
          const count=variants.kitCount(valid);cartTotal.textContent=format(count*unitAmount);
          panel.querySelector('[data-cart-count]').textContent=count+' '+(count===1?'kit':'kits');
          button.disabled=editing>=0 || [...cartList.querySelectorAll('input')].some(x=>!x.validity.valid);
          cartMessage.textContent='Cantidad actualizada.';
        }); label.append(qty);
        const subtotal=document.createElement('strong'); subtotal.textContent=format(item.quantity*unitAmount);
        const edit=document.createElement('button');edit.type='button';edit.textContent='Editar';edit.setAttribute('aria-label','Editar '+variants.formula(item));
        edit.addEventListener('click',()=>{
          const item=items[index];
          editing=index;mode.value=item.colorMode;sealerInput.value=item.sealer;input.value=item.quantity;
          colorInput.value=item.color || '';tone1.value=item.color1 || '';tone2.value=item.color2 || '';ratio.value=item.percentage1 || '';
          refresh();total.textContent=format(item.quantity*unitAmount);add.textContent='GUARDAR CONFIGURACIÓN';cancelEdit.hidden=false;button.disabled=true;mode.focus();
        });
        const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar';remove.setAttribute('aria-label','Quitar '+variants.formula(item));
        remove.addEventListener('click',()=>{items.splice(index,1);endEdit();saveCart();renderCart();cartMessage.textContent='Configuración eliminada.';add.focus();});
        controls.append(label,subtotal,edit,remove);row.append(summary,controls);cartList.append(row);
      });
      const count=items.reduce((n,x)=>n+x.quantity,0);
      cartTotal.textContent=format(count*unitAmount);
      panel.querySelector('[data-cart-count]').textContent=count+' '+(count===1?'kit':'kits');
      panel.querySelector('[data-cart-empty]').hidden=items.length>0;
      button.disabled=!items.length || editing>=0;
    }
    function endEdit() {editing=-1;add.textContent='AÑADIR AL CARRITO';cancelEdit.hidden=true;}
    cancelEdit.addEventListener('click',()=>{endEdit();renderCart();cartMessage.textContent='Edición cancelada.';});
    add.disabled=false;
    add.addEventListener('click',()=>{
      if(preparing)return;
      const n=quantity();
      if(!n || !input.reportValidity()) {input.reportValidity();return;}
      if(variantControls.some(field=>!field.disabled && !field.reportValidity()))return;
      const item=variants.normalize(requestBody(n));if(!item)return;
      const next=items.map(x=>({...x}));if(editing>=0)next[editing]=item;else next.push(item);
      const valid=variants.restore({items:next});
      if(!valid) {cartMessage.textContent='Puedes comprar hasta 20 kits en un solo pedido. Ajusta las cantidades.';return;}
      items=valid.items;endEdit();saveCart();renderCart();
      cartMessage.textContent='Carrito actualizado. Puedes agregar otro color o continuar al pago.';
    });
    renderCart();
    button.addEventListener('click', async () => {
      if (preparing || editing>=0 || [...cartList.querySelectorAll('input')].some(x=>!x.reportValidity())) return;
      const selected = variants.restore({items});
      if (!selected) {cartMessage.textContent='Añade al menos una configuración al carrito.';return;}
      const n = variants.kitCount(selected);
      const body = {items:selected.items.map(item=>({productId:'microcemento-kaemento-launch',...item}))};
      preparing = true;
      button.disabled = true;
      input.disabled = true;
      const cartControls=[add,cancelEdit,...cartList.querySelectorAll('input,button')];
      cartControls.forEach(field=>field.disabled=true);
      variantControls.forEach(field => field.disabled = true);
      button.setAttribute('aria-busy', 'true');
      status.textContent = 'Preparando pago seguro…';
      contact.hidden = true;
      let opened = false;
      try {
        await loadCustomerStep();
        const data = await window.KaementoOrderCustomer.open(selected, async customer => {
          const response = await fetch('/api/bold/checkout', {
            method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...body, customer}),
            signal:AbortSignal.timeout(15000), cache:'no-store'
          });
          if (!response.ok) { const error = new Error('Order unavailable'); error.code = response.status === 400 ? 'INVALID_CUSTOMER' : 'UNAVAILABLE'; throw error; }
          return response.json();
        });
        if (!data) { status.textContent = ''; return; }
        await loadSdk();
        if (!Number.isInteger(data.amount) || data.amount !== n * unitAmount || data.currency !== 'COP' ||
            data.tax !== 'vat-19' || variants.kitCount(data.selection || {}) !== n ||
            JSON.stringify(data.selection) !== JSON.stringify(selected) || !/^[A-Za-z0-9_-]{1,60}$/.test(data.orderId) ||
            !/^[a-f0-9]{64}$/.test(data.integritySignature) || typeof data.apiKey !== 'string' || !data.apiKey) {
          throw new Error('Invalid configuration');
        }
        // Keep only non-personal selection data, keyed by this order, for the return page.
        // This is a display aid, not a persistent or verified order record.
        try {
          const saved = JSON.parse(sessionStorage.getItem('kaemento-bold-selections') || '{}');
          const entries = saved && typeof saved === 'object' && !Array.isArray(saved) ? Object.entries(saved).slice(-19) : [];
          sessionStorage.setItem('kaemento-bold-selections', JSON.stringify(Object.fromEntries([...entries, [data.orderId, data.selection]])));
        } catch (_) { /* Payment still works if browser storage is unavailable. */ }
        const config = {
          orderId: data.orderId, amount: String(data.amount), currency: data.currency,
          apiKey: data.apiKey, integritySignature: data.integritySignature,
          description: data.description, tax: data.tax,
          redirectionUrl: window.location.origin + '/pagos/resultado'
        };
        try {
          const checkout = new window.BoldCheckout({ ...config, renderMode: 'embedded' });
          await checkout.open();
        } catch (_) {
          // Official standard checkout is the fallback; reuse the same signed order.
          const checkout = new window.BoldCheckout(config);
          await checkout.open();
        }
        opened = true;
        status.textContent = 'Continúa en el pago seguro de Bold.';
        // Only after open() completes without error. This is not a confirmed purchase.
        window.kaementoTrack?.('begin_checkout', {
          currency: 'COP', value: data.amount,
          items: variants.analyticsItems(selected)
        });
      } catch (_) {
        status.textContent = errorText;
        contact.hidden = false;
      } finally {
        // Retain the lock briefly after opening, including the second click of a double-click.
        if (opened) await new Promise(resolve => setTimeout(resolve, 1200));
        preparing = false;
        cartControls.forEach(field=>field.disabled=false);
        renderCart();
        input.disabled = false;
        variantControls.forEach(field => field.disabled = false);
        refresh();
        button.removeAttribute('aria-busy');
        if (!opened) button.focus({preventScroll:true});
      }
    });
  });
})();
