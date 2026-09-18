(() => {
  'use strict';
  if (window.kaementoLaunchReady) return;
  window.kaementoLaunchReady = true;
  const campaign = window.KaementoLaunchCampaign;
  if (!campaign || !campaign.enabled) {
    document.querySelectorAll('[data-launch-block]').forEach(el => { el.hidden = true; });
    return;
  }
  const money = value => '$' + new Intl.NumberFormat('es-CO').format(value);
  for (const [key, value] of Object.entries({regular: money(campaign.regularPrice), price: money(campaign.launchPrice), discount: campaign.discount, customers: campaign.maxCustomers, days: campaign.durationDays})) {
    document.querySelectorAll('[data-launch-' + key + ']').forEach(el => { el.textContent = value; });
  }
  const promotion = {promotion_name: 'microcemento_kaemento_launch_2026'};
  document.querySelectorAll('[data-launch-cta]').forEach(link => link.addEventListener('click', event => {
    window.kaementoTrack?.('select_promotion', {...promotion, button_id: link.id});
    if (link.getAttribute('href') === '#comprar-microcemento') {
      event.preventDefault();
      const target = document.getElementById('comprar-microcemento');
      target.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start'});
      history.replaceState(null, '', '#comprar-microcemento');
    }
  }));
  const target = document.querySelector('[data-bold-purchase]');
  if (target && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        window.kaementoTrack?.('view_promotion', promotion);
        observer.disconnect();
      }
    }, {threshold: 0.05});
    observer.observe(target);
  }
})();
