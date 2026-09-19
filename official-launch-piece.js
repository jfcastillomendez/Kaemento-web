(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      entry.target.classList.add('is-entering');
      observer.unobserve(entry.target);
    }
  }, {threshold:0.05});
  document.querySelectorAll('.official-depth').forEach(el => observer.observe(el));
})();
