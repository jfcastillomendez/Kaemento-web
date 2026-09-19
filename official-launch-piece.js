(() => {
  const art = document.querySelector('.campaign-secondary');
  if (!art || matchMedia('(prefers-reduced-motion:reduce)').matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      art.classList.add('campaign-revealed');
      observer.disconnect();
    }
  }, {threshold:0.12});
  observer.observe(art);
})();
