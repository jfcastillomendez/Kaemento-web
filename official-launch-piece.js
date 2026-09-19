(() => {
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  if (reduced.matches || !('IntersectionObserver' in window)) return;
  const home = document.querySelector('.campaign-secondary');
  if(home){
    const reveal=new IntersectionObserver(entries=>{
      if(entries.some(e=>e.isIntersecting)){home.classList.add('campaign-revealed');reveal.disconnect();}
    },{threshold:.12});reveal.observe(home);
  }
  const countObserver=new IntersectionObserver(entries=>{
    entries.forEach(async entry=>{
      if(!entry.isIntersecting)return;
      countObserver.unobserve(entry.target);
      const art=entry.target.closest('.campaign-art');
      try{await art.querySelector('img').decode();}catch(_){return;}
      if(reduced.matches || !art.isConnected)return;
      const layer=document.createElement('span');
      layer.className='campaign-discount-counter';layer.setAttribute('aria-hidden','true');
      layer.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 86" preserveAspectRatio="none"><defs><linearGradient id="counter-paper" x2="0" y2="1"><stop stop-color="#f7f0e3"/><stop offset="1" stop-color="#f9f4eb"/></linearGradient></defs><rect width="190" height="86" fill="url(#counter-paper)"/><text x="95" y="72" text-anchor="middle" font-family="Georgia,serif" font-size="80" font-weight="700" fill="#806024">0%</text></svg>';
      art.appendChild(layer);
      const text=layer.querySelector('text');const start=performance.now();
      const tick=now=>{
        if(reduced.matches){layer.remove();return;}
        const t=Math.min(1,(now-start)/1400);
        text.textContent=Math.round(15*(1-Math.pow(1-t,3)))+'%';
        if(t<1)requestAnimationFrame(tick);
        else{layer.classList.add('is-complete');setTimeout(()=>layer.remove(),180);}
      };requestAnimationFrame(tick);
    });
  },{threshold:.5});
  document.querySelectorAll('.campaign-offer-glow').forEach(el=>countObserver.observe(el));
})();
