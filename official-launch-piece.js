(() => {
  'use strict';
  const reducedOffer = matchMedia('(prefers-reduced-motion: reduce)');
  if (!reducedOffer.matches && 'IntersectionObserver' in window) {
    const offers = [...document.querySelectorAll('.official-offer')];
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const offer = entry.target;
        observer.unobserve(offer);
        offer.classList.add('is-offer-playing');
        const count = offer.querySelector('[data-official-count]');
        const start = performance.now() + 580;
        const tick = now => {
          const progress = Math.max(0, Math.min(1, (now - start) / 650));
          count.textContent = reducedOffer.matches ? '15' : String(Math.round(progress * 15));
          if (progress < 1 && !reducedOffer.matches) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(() => offer.classList.add('is-offer-settled'),2300);
      });
    }, {threshold:0.3});
    offers.forEach(offer => { offer.classList.add('is-offer-ready'); observer.observe(offer); });
    reducedOffer.addEventListener('change',() => {
      if (reducedOffer.matches) offers.forEach(offer => {
        offer.classList.add('is-offer-playing','is-offer-settled');
        offer.querySelector('[data-official-count]').textContent = '15';
      });
    });
  }
  const sections = [...document.querySelectorAll('.official-launch')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 901px) and (pointer: fine)');
  if (!sections.length || reduced.matches || !('IntersectionObserver' in window)) return;
  const reveal = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-revealed');
      reveal.unobserve(entry.target);
    }
  }, {threshold:0.05});
  sections.forEach(section => { section.classList.add('is-reveal-ready'); reveal.observe(section); });
  let pending = false;
  const update = () => {
    pending = false;
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      const y = !reduced.matches && desktop.matches && rect.bottom > 0 && rect.top < innerHeight
        ? Math.max(-5,Math.min(5,(innerHeight/2-rect.top-rect.height/2)*0.012)) : 0;
      section.style.setProperty('--official-parallax', y + 'px');
    }
  };
  const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
  addEventListener('scroll',schedule,{passive:true});
  addEventListener('resize',schedule,{passive:true});
  reduced.addEventListener('change',() => { if (reduced.matches) sections.forEach(s=>s.classList.add('is-revealed')); schedule(); });
  schedule();
})();
