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
    // Reconciled 2026-10-10: four previous external orders + three paid custom-color orders.
    // Nine paid orders reported in total; the other two are already counted dynamically in Redis.
    historicalOrders: 7,
    durationDays: 60, // Original 30 days + 30-day extension approved on 2026-10-10
    startsAt: '2026-09-19T00:29:14Z',
    endsAt: '2026-11-18T00:29:14Z'
  });
  if (typeof module === 'object' && module.exports) module.exports = campaign;
  else root.KaementoLaunchCampaign = campaign;
})(typeof window !== 'undefined' ? window : globalThis);
