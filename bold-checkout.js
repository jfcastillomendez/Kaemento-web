(() => {
  if (window.kaementoBoldInitialized) return;
  window.kaementoBoldInitialized = true;
  const sdkUrl = 'https://checkout.bold.co/library/boldPaymentButton.js';
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
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (preparing) return;
      const n = quantity();
      if (!n || !input.reportValidity()) { input.reportValidity(); return; }
      preparing = true;
      button.disabled = true;
      input.disabled = true;
      button.setAttribute('aria-busy', 'true');
      status.textContent = 'Preparando pago seguro…';
      contact.hidden = true;
      let opened = false;
      try {
        await loadSdk();
        const response = await fetch('/api/bold/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: 'microcemento-kaemento-launch', quantity: n }),
          signal: AbortSignal.timeout(15000), cache: 'no-store'
        });
        if (!response.ok) throw new Error('Checkout unavailable');
        const data = await response.json();
        if (!Number.isInteger(data.amount) || data.amount !== n * unitAmount || data.currency !== 'COP' ||
            data.tax !== 'vat-19' || !/^[A-Za-z0-9_-]{1,60}$/.test(data.orderId) ||
            !/^[a-f0-9]{64}$/.test(data.integritySignature) || typeof data.apiKey !== 'string' || !data.apiKey) {
          throw new Error('Invalid configuration');
        }
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
          items: [{ item_id: 'microcemento-kaemento', item_name: 'Microcemento KAEMENTO', price: unitAmount, quantity: n }]
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
        button.removeAttribute('aria-busy');
      }
    });
  });
})();
