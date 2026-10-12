// A one-use, per-tab return ticket for the explicit WhatsApp consultation only.
// Stores product choices, never customer data, prices, payment tokens or orders.
(() => {
  const key = 'kaemento-whatsapp-consultation-v1', lifetime = 2 * 60 * 60 * 1000;
  const panels = [...document.querySelectorAll('[data-bold-purchase]')], adapters = new Map();
  let saved, armedUntil = 0, away = false, returning = false, pageHidden = false;
  function remove() { try { sessionStorage.removeItem(key); } catch (_) {} }
  try {
    const text = sessionStorage.getItem(key);
    if (text && text.length <= 32000) {
      const value = JSON.parse(text);
      if (value.version === 1 && value.path === location.pathname && value.expiresAt > Date.now() &&
          value.expiresAt <= Date.now() + lifetime && Array.isArray(value.panels)) saved = value.panels;
    }
  } catch (_) { /* The current page still works without browser storage. */ }
  remove();
  const active = () => armedUntil > Date.now();
  function discard() { armedUntil = 0; away = false; remove(); }
  function snapshot() {
    const data = panels.map(panel => Object.fromEntries(
      [...(adapters.get(panel) || [])].map(([name, adapter]) => [name, adapter.save()])
    ));
    try { sessionStorage.setItem(key, JSON.stringify({version:1, path:location.pathname, expiresAt:armedUntil, panels:data})); } catch (_) {}
  }
  function returned() {
    if (!away || pageHidden) return;
    // Keep the exception through all page-show listeners, then consume the ticket.
    returning = active();
    discard();
    setTimeout(() => { returning = false; }, 0);
  }
  window.KaementoConsultation = {
    register(panel, name, adapter) {
      if (!panels.includes(panel)) return;
      if (!adapters.has(panel)) adapters.set(panel, new Map());
      adapters.get(panel).set(name, adapter);
      const value = saved?.[panels.indexOf(panel)]?.[name];
      if (value) adapter.restore(value);
    },
    read(panel, name) { return adapters.get(panel)?.get(name)?.save(); },
    arm() { armedUntil = Date.now() + lifetime; away = false; snapshot(); },
    keep: () => active() || returning,
    discard
  };
  window.addEventListener('pagehide', () => {
    if (active()) { snapshot(); away = true; pageHidden = true; }
    else discard();
  });
  window.addEventListener('pageshow', () => { pageHidden = false; returned(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && active()) { snapshot(); away = true; }
    else if (!document.hidden) returned();
  });
  window.addEventListener('blur', () => { if (active()) away = true; });
  window.addEventListener('focus', returned);
  // Continuing on the site ends the exception, even if WhatsApp did not open.
  document.addEventListener('pointerdown', discard, {capture:true});
  document.addEventListener('keydown', discard, {capture:true});
  document.addEventListener('input', discard, {capture:true});
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || link.target === '_blank') return;
    const url = new URL(link.href, location.href);
    if (url.origin === location.origin && url.pathname !== location.pathname) discard();
  }, {capture:true});
})();
