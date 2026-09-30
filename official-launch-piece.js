(() => {
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  if (!('IntersectionObserver' in window)) return;
  const home = document.querySelector('.campaign-secondary');
  if (home) {
    const reveal = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        home.classList.add('campaign-revealed');
        reveal.disconnect();
      }
    }, {threshold:.12});
    reveal.observe(home);
  }
  const states = new Map();
  function stop(state) {
    state.generation++;
    state.active = false;
    cancelAnimationFrame(state.frame);
    clearTimeout(state.timer);
    state.layer?.remove();
    state.layer = null;
    state.target.classList.add('campaign-offer-inactive');
  }
  async function play(state) {
    if (state.active || !state.visible || document.hidden || reduced.matches) return;
    state.active = true;
    const generation = state.generation;
    try { await state.art.querySelector('img').decode(); }
    catch (_) { if (generation === state.generation) state.active = false; return; }
    if (generation !== state.generation || !state.art.isConnected || !state.visible || document.hidden || reduced.matches) return;
    // Removing the inactive class starts both existing CSS effects from their beginning.
    state.target.classList.remove('campaign-offer-inactive');
    const layer = document.createElement('span');
    layer.className = 'campaign-discount-counter';
    layer.setAttribute('aria-hidden','true');
    layer.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 86" preserveAspectRatio="none"><defs><linearGradient id="counter-paper" x2="0" y2="1"><stop stop-color="#f7f0e3"/><stop offset="1" stop-color="#f9f4eb"/></linearGradient></defs><rect width="190" height="86" fill="url(#counter-paper)"/><text x="95" y="72" text-anchor="middle" font-family="Georgia,serif" font-size="80" font-weight="700" fill="#806024">0%</text></svg>';
    state.art.appendChild(layer);
    state.layer = layer;
    const text = layer.querySelector('text'), start = performance.now();
    const tick = now => {
      if (generation !== state.generation) return;
      const t = Math.min(1,(now-start)/1400);
      text.textContent = Math.round(15*(1-Math.pow(1-t,3)))+'%';
      if (t < 1) state.frame = requestAnimationFrame(tick);
      else {
        layer.classList.add('is-complete');
        state.timer = setTimeout(() => { layer.remove(); if (state.layer === layer) state.layer = null; },180);
      }
    };
    state.frame = requestAnimationFrame(tick);
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = states.get(entry.target);
      if (!entry.isIntersecting || entry.intersectionRatio === 0) {
        state.visible = false;
        stop(state);
      } else if (entry.intersectionRatio >= .5) {
        // Rearm only after leaving completely, avoiding repeats around the 50% threshold.
        state.visible = true;
        play(state);
      }
    }
  }, {threshold:[0,.5]});
  document.querySelectorAll('.campaign-offer-glow').forEach(target => {
    const art = target.closest('.campaign-art');
    if (!art) return;
    const state = {target,art,visible:false,active:false,generation:0,frame:0,timer:0,layer:null};
    states.set(target,state);
    stop(state);
    observer.observe(target);
  });
  const resume = () => states.forEach(state => {
    if (document.hidden || reduced.matches) stop(state);
    else play(state);
  });
  document.addEventListener('visibilitychange',resume);
  reduced.addEventListener('change',resume);
  window.addEventListener('pagehide',() => states.forEach(stop));
  window.addEventListener('pageshow',resume);
})();
