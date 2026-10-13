// Shared reference for the single area calculator and the material price per m².
// Whole-kit quantities are still validated by the existing cart and checkout.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaementoKitCoverage = factory();
})(typeof window === 'object' ? window : globalThis, () => {
  const m2PerKit = 10;
  function estimate(value) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const area = Number(value);
    if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(String(value)) || !Number.isFinite(area) || area <= 0 || area > 100000) return null;
    // Work in hundredths so decimal areas just above a full kit always round up.
    return Math.ceil(Math.round(area * 100) / (m2PerKit * 100));
  }
  return {m2PerKit, estimate};
});
