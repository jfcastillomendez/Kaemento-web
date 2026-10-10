/* Shared discovery links. Purchase and payment state remain owned by the checkout. */
(() => {
  if (document.querySelector('.kae-access') || location.pathname.startsWith('/pagos/')) return;
  const header = document.querySelector('header.nav');
  if (!header) return;
  const product = '/productos/microcemento-kaemento.html';
  const home = location.pathname === '/' || location.pathname === '/index.html';
  const hasSimulator = !!document.querySelector('[data-bold-purchase]');
  const simulatorHref = hasSimulator ? '#vista-colores-microcemento' : product + '#vista-colores-microcemento';
  const promotionHref = home ? '#lanzamiento-microcemento' : product + '#lanzamiento-microcemento';
  const track = (name, button) => window.kaementoTrack?.(name, {button_id:button});
  const promotion = {promotion_name:'microcemento_kaemento_launch_2026'};
  const bar = document.createElement('aside');
  bar.className = 'kae-access'; bar.setAttribute('aria-label','Descubre Microcemento KAEMENTO');
  bar.innerHTML = `<a class="kae-access-promo" href="${promotionHref}" data-discovery-promo id="discovery-promotion"><span data-discovery-label>MICROCEMENTO KAEMENTO</span><strong data-discovery-action>Ver promoción <span aria-hidden="true">↗</span></strong></a><a class="kae-access-simulator" href="${simulatorHref}" data-discovery-simulator id="discovery-simulator"><span>IMAGINA TU ESPACIO</span><strong>Prueba tu tonalidad <span aria-hidden="true">↗</span></strong></a>`;
  document.body.append(bar); document.body.classList.add('has-kae-discovery');
  const sizeHeader = () => document.documentElement.style.setProperty('--kae-header-height',header.getBoundingClientRect().height+'px');
  new ResizeObserver(sizeHeader).observe(header); sizeHeader();
  // An offer stays beside the existing add-to-cart control while a visitor configures.
  document.querySelectorAll('[data-bold-purchase]').forEach(panel => {
    const note = document.createElement('p'); note.className = 'kae-selection-offer'; note.dataset.discoveryOffer = '';
    panel.querySelector('[data-cart-add]')?.before(note);
  });
  let currentState = 'unknown';
  function viewedPromotion() {
    if (currentState !== 'active' || document.hidden || window.kaementoPromotionViewed) return;
    const rect = bar.getBoundingClientRect();
    if (!rect.height || rect.bottom <= 0 || rect.top >= innerHeight || getComputedStyle(bar).visibility === 'hidden') return;
    window.kaementoPromotionViewed = true;
    window.kaementoTrack?.('view_promotion', {...promotion,button_id:'discovery-promotion'});
  }
  function present(data) {
    const campaign = window.KaementoLaunchCampaign;
    const active = data.state === 'active' && campaign?.enabled;
    currentState = active ? 'active' : data.state === 'active' ? 'ended' : data.state;
    const label = active ? `LANZAMIENTO · ${campaign.discount}%` : 'MICROCEMENTO KAEMENTO';
    const regular = ['ended','sold_out','upcoming'].includes(data.state);
    const action = regular ? 'Configura tu kit ↗' : 'Ver promoción ↗';
    bar.querySelector('[data-discovery-label]').textContent = label;
    bar.querySelector('[data-discovery-action]').textContent = action;
    bar.dataset.state = currentState;
    const message = active ? `${campaign.discount}% de lanzamiento · $${new Intl.NumberFormat('es-CO').format(campaign.launchPrice)} IVA incluido por kit` : regular ? 'Precio regular · $430.000 IVA incluido por kit' : 'Consulta la disponibilidad de la promoción con KAEMENTO.';
    document.querySelectorAll('[data-discovery-offer]').forEach(el => {el.textContent = message;});
    document.querySelectorAll('[data-discovery-live]').forEach(el => {el.hidden = !active;});
    const buy = document.querySelector('[data-discovery-buy]');
    if (buy) buy.textContent = active ? 'COMPRAR CON DESCUENTO ↗' : 'CONFIGURA TU KIT ↗';
    document.body.classList.toggle('kae-regular-sale',regular);
    // Keep the approved campaign artwork intact; show the existing kit asset after its validity.
    document.querySelectorAll('.campaign-art').forEach(art => {
      if (!regular || art.nextElementSibling?.classList.contains('campaign-standard-art')) return;
      const image = document.createElement('img');
      image.src = '/products/contenido-kit-microcemento-kaemento.webp?v=150ml';
      image.alt = 'Componentes del kit Microcemento KAEMENTO';
      image.width = 1122; image.height = 1402; image.className = 'campaign-standard-art';
      art.after(image);
    });
    document.querySelectorAll('.campaign-mobile-cta').forEach(link => {
      link.textContent = `CONFIGURA TU KIT · $${new Intl.NumberFormat('es-CO').format(regular ? 430000 : 365500)} IVA incluido por kit`;
    });
    viewedPromotion();
  }
  function load(src, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve,reject) => {
      let script = [...document.scripts].find(s => new URL(s.src || location.href).pathname === src.split('?')[0]);
      const fresh = !script;
      if (!script) {script = document.createElement('script');script.src = src;}
      script.addEventListener('load',resolve,{once:true});script.addEventListener('error',reject,{once:true});
      if (fresh) document.head.append(script);
    });
  }
  present({state:'unknown'});
  load('/microcemento-launch-config.js?v=3',()=>!!window.KaementoLaunchCampaign)
    .then(()=>load('/launch-availability.js?v=4',()=>!!window.KaementoPromotion))
    .then(()=>window.KaementoPromotion.subscribe(present)).catch(()=>present({state:'unknown'}));
  document.addEventListener('visibilitychange',viewedPromotion);
  document.addEventListener('scroll',viewedPromotion,{passive:true});
  window.addEventListener('resize',viewedPromotion);
  const updateFocus = () => document.body.classList.toggle('kae-discovery-input',!!document.activeElement?.matches('textarea,input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])'));
  document.addEventListener('focusin',updateFocus);document.addEventListener('focusout',()=>requestAnimationFrame(updateFocus));
  const cart = document.querySelector('.kae-cart');
  if (cart) new IntersectionObserver(entries=>{document.body.classList.toggle('kae-discovery-cart',entries.some(e=>e.isIntersecting));viewedPromotion();},{threshold:0}).observe(cart);
  const visual = document.querySelector('.kae-discovery-visual');
  if (visual) new IntersectionObserver(entries=>document.body.classList.toggle('kae-discovery-visual-active',entries.some(e=>e.isIntersecting)),{threshold:0}).observe(visual);
  // Same-page shortcuts preserve the cart and honor the full fixed-header offset.
  document.addEventListener('click',event => {
    const link = event.target instanceof Element && event.target.closest('a[data-discovery-simulator],a[data-discovery-promo]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.hasAttribute('data-discovery-simulator')) track('microcemento_simulator_open',link.id);
    else if (currentState === 'active') window.kaementoTrack?.('select_promotion',{...promotion,button_id:link.id});
    if (!link.getAttribute('href').startsWith('#')) return;
    const target = document.getElementById(link.hash.slice(1));
    if (!target) return;
    event.preventDefault();history.pushState(null,'',link.hash);
    target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
    if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
    target.focus({preventScroll:true});
  });
})();
