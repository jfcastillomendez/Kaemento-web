(() => {
  const home = document.querySelector('.hero > .official-launch');
  const surface = document.querySelector('.home-hero-mobile-visual');
  const mobile = matchMedia('(max-width:720px)');
  if(home && surface){const hero=home.parentElement;const place=()=>{(mobile.matches?surface:hero).appendChild(home);};place();mobile.addEventListener('change',place);}
  const reduced=matchMedia('(prefers-reduced-motion:reduce)');
  const run=el=>{
    if(el.dataset.started)return;el.dataset.started='true';el.classList.add('is-entered');
    const count=el.querySelector('[data-official-count]');
    if(reduced.matches){count.textContent='15';return;}
    const start=performance.now();count.textContent='0';
    const tick=now=>{const t=Math.min(1,(now-start)/1400);count.textContent=String(Math.round(15*(1-Math.pow(1-t,3))));if(t<1&&!reduced.matches)requestAnimationFrame(tick);else{count.textContent='15';el.classList.add('is-counted');}};requestAnimationFrame(tick);
  };
  const blocks=document.querySelectorAll('.official-launch');
  if(!('IntersectionObserver' in window)){blocks.forEach(run);return;}
  const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){run(e.target);observer.unobserve(e.target);}})},{threshold:.15});blocks.forEach(el=>observer.observe(el));
})();
