(() => {
  const blocks = [...document.querySelectorAll('[data-launch-availability]')];
  if (!blocks.length) return;
  const visible = new Set();
  let busy = false, timer, lastUpdate = 0;
  async function update() {
    clearTimeout(timer);
    if (busy || document.hidden || !visible.size) return;
    busy = true;
    try {
      const response = await fetch('/api/bold/promotion',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('Availability unavailable');
      const data = await response.json();
      if (data.capacity !== 30 || !Number.isInteger(data.remaining) || data.remaining < 0 || data.remaining > data.capacity) throw new Error('Invalid availability');
      const message = data.remaining === 0 ? 'Cupo de 30 pedidos completado' : data.remaining === 1 ? 'Queda 1 pedido con precio de lanzamiento' : `Quedan ${data.remaining} pedidos con precio de lanzamiento`;
      blocks.forEach(block => { block.querySelector('[data-launch-remaining]').textContent = message; });
      lastUpdate = Date.now();
    } catch (_) {
      // Never replace a failed request with an invented available quota.
      blocks.forEach(block => { block.querySelector('[data-launch-remaining]').textContent = 'Consulta disponibilidad con KAEMENTO'; });
    } finally {
      busy = false;
      if (!document.hidden && visible.size) timer = setTimeout(update,60000);
    }
  }
  function resume() {
    clearTimeout(timer);
    if (document.hidden || !visible.size) return;
    const delay = Math.max(0,15000-(Date.now()-lastUpdate));
    if (!delay) update(); else timer = setTimeout(update,delay);
  }
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));
      resume();
    });
    blocks.forEach(block => observer.observe(block));
  } else { blocks.forEach(block => visible.add(block)); resume(); }
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pagehide',() => clearTimeout(timer));
  window.addEventListener('pageshow',resume);
})();
