(() => {
  if (window.KaementoPromotion) return;
  const blocks = [...document.querySelectorAll('[data-launch-availability]')];
  const visible = new Set(), listeners = new Set();
  let busy = false, timer, lastUpdate = 0, snapshot = {state:'unknown'};
  const interested = () => visible.size || listeners.size;
  function normalized(data) {
    if (!['active','ended','upcoming','sold_out'].includes(data.state) || data.capacity !== 30 || !Number.isInteger(data.remaining) || data.remaining < 0 || data.remaining > data.capacity || !Number.isFinite(Date.parse(data.endsAt))) throw new Error('Invalid availability');
    const state = Date.now() >= Date.parse(data.endsAt) ? 'ended' : data.remaining === 0 && data.state === 'active' ? 'sold_out' : data.state;
    return {state,remaining:data.remaining,capacity:data.capacity,endsAt:data.endsAt};
  }
  function notify(data) {
    snapshot = data;
    const message = data.state === 'unknown' ? 'Consulta disponibilidad con KAEMENTO' : data.state === 'ended' ? 'La promoción de lanzamiento ha finalizado' : data.state === 'upcoming' ? 'El lanzamiento aún no ha comenzado' : data.state === 'sold_out' ? 'Cupo de 30 pedidos completado' : data.remaining === 1 ? 'Queda 1 pedido con precio de lanzamiento' : `Quedan ${data.remaining} pedidos con precio de lanzamiento`;
    blocks.forEach(block => {block.querySelector('[data-launch-remaining]').textContent = message;});
    document.querySelectorAll('[data-bold-purchase]').forEach(panel => {
      let notice = panel.querySelector('[data-launch-status]');
      if (!notice) {notice = document.createElement('p');notice.dataset.launchStatus = '';notice.className = 'launch-limit';panel.prepend(notice);}
      notice.textContent = data.state === 'active' || data.state === 'unknown' ? '' : message + '. Consulta disponibilidad con KAEMENTO.';
      notice.hidden = !notice.textContent;
    });
    listeners.forEach(fn => fn(data));
  }
  async function update() {
    clearTimeout(timer);
    if (busy || document.hidden || !interested()) return;
    busy = true;
    try {
      const response = await fetch('/api/bold/promotion',{cache:'no-store',signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error('Availability unavailable');
      notify(normalized(await response.json()));
    } catch (_) {notify({state:'unknown'});}
    finally {
      busy = false;lastUpdate = Date.now();
      if (!document.hidden && interested()) {
        const untilEnd = snapshot.state === 'active' ? Date.parse(snapshot.endsAt)-Date.now() : Infinity;
        timer = setTimeout(() => {
          if (snapshot.state === 'active' && Date.now() >= Date.parse(snapshot.endsAt)) notify({...snapshot,state:'ended'});
          update();
        },Math.max(1,Math.min(60000,untilEnd)));
      }
    }
  }
  function resume() {
    clearTimeout(timer);
    if (document.hidden || !interested()) return;
    if (snapshot.state === 'active' && Date.now() >= Date.parse(snapshot.endsAt)) notify({...snapshot,state:'ended'});
    const delay = Math.max(0,15000-(Date.now()-lastUpdate));
    if (!delay) update(); else {
      const untilEnd = snapshot.state === 'active' ? Date.parse(snapshot.endsAt)-Date.now() : Infinity;
      timer = setTimeout(() => {
        if (snapshot.state === 'active' && Date.now() >= Date.parse(snapshot.endsAt)) notify({...snapshot,state:'ended'});
        update();
      },Math.max(1,Math.min(delay,untilEnd)));
    }
  }
  window.KaementoPromotion = {
    getState() {return {...snapshot};},
    subscribe(fn) {listeners.add(fn);fn(snapshot);resume();return () => {listeners.delete(fn);resume();};}
  };
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target));resume();
    });
    blocks.forEach(block => observer.observe(block));
  } else {blocks.forEach(block => visible.add(block));resume();}
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pagehide',() => clearTimeout(timer));
  window.addEventListener('pageshow',resume);
})();
