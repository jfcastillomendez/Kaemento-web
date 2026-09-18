(() => {
  if (window.kaementoBoldInitialized) return;
  window.kaementoBoldInitialized = true;
  const sdkUrl = 'https://checkout.bold.co/library/boldPaymentButton.js';
  const variants = window.KaementoBoldConfig;
  const unitAmount = 365500;
  const format = amount => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount);
  const errorText = 'No pudimos abrir el pago en este momento. Intenta nuevamente o contáctanos por WhatsApp.';
  let sdkPromise;
  let preparing = false;
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
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (preparing) return;
      const n = quantity();
      if (!n || !input.reportValidity()) { input.reportValidity(); return; }
      if (variantControls.some(field => !field.disabled && !field.reportValidity())) return;
      const body = requestBody(n);
      const selected = variants.normalize(body);
      if (!selected) { status.textContent = 'Revisa el color, los tonos y la proporción seleccionados.'; return; }
      preparing = true;
      button.disabled = true;
      input.disabled = true;
      variantControls.forEach(field => field.disabled = true);
      button.setAttribute('aria-busy', 'true');
      status.textContent = 'Preparando pago seguro…';
      contact.hidden = true;
      let opened = false;
      try {
        await loadSdk();
        const response = await fetch('/api/bold/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000), cache: 'no-store'
        });
        if (!response.ok) throw new Error('Checkout unavailable');
        const data = await response.json();
        if (!Number.isInteger(data.amount) || data.amount !== n * unitAmount || data.currency !== 'COP' ||
            data.tax !== 'vat-19' || data.selection?.quantity !== n ||
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
          items: [{ item_id: 'microcemento-kaemento', item_name: 'Microcemento KAEMENTO', price: unitAmount, quantity: n, item_variant: variants.itemVariant(selected), sealer_type: selected.sealer }]
        });
      } catch (_) {
        status.textContent = errorText;
        contact.hidden = false;
      } finally {
        // Retain the lock briefly after opening, including the second click of a double-click.
        if (opened) await new Promise(resolve => setTimeout(resolve, 1200));
        preparing = false;
        button.disabled = false;
        input.disabled = false;
        variantControls.forEach(field => field.disabled = false);
        refresh();
        button.removeAttribute('aria-busy');
      }
    });
  });
})();
