// Shared campaign rules. The first successful Production deployment was
// c36d25b, 2026-09-19T00:29:14Z (September 18, 19:29:14 in Bogotá).
(function (root) {
  const campaign = Object.freeze({
    enabled: true,
    regularPrice: 430000,
    launchPrice: 365500,
    discount: 15,
    maxCustomers: 30, // Legacy presentation key; quota is counted by paid orders.
    maxOrders: 30,
    historicalOrders: 4, // Six reported orders minus two already recorded in Redis.
    durationDays: 30,
    startsAt: '2026-09-19T00:29:14Z',
    endsAt: '2026-10-19T00:29:14Z'
  });
  if (typeof module === 'object' && module.exports) module.exports = campaign;
  else root.KaementoLaunchCampaign = campaign;
})(typeof window !== 'undefined' ? window : globalThis);
