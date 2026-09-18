// Shared, public variant rules. No credentials or payment signing logic.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaementoBoldConfig = factory();
})(typeof window === 'object' ? window : globalThis, () => {
  const colors = new Map([['extra-blanco','Extra Blanco'],['arena','Arena'],['gris-cemento','Gris Cemento'],['negro','Negro'],['terracota','Terracota']]);
  const sealers = new Map([['mate','Mate'],['brillante','Brillante']]);
  const percentages = [10,20,30,40,50,60,70,80,90];
  function normalize(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.productId !== 'microcemento-kaemento-launch' ||
        !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 20 || !sealers.has(body.sealer)) return null;
    const shared = ['productId','quantity','colorMode','sealer'];
    const fields = body.colorMode === 'standard' ? [...shared,'color'] : body.colorMode === 'mix' ? [...shared,'color1','color2','percentage1','percentage2'] : [];
    if (!fields.length || Object.keys(body).length !== fields.length || !fields.every(k => Object.hasOwn(body,k))) return null;
    const selection = { quantity: body.quantity, colorMode: body.colorMode, sealer: body.sealer };
    if (body.colorMode === 'standard') return colors.has(body.color) ? {...selection, color:body.color} : null;
    if (!colors.has(body.color1) || !colors.has(body.color2) || body.color1 === body.color2 ||
        !percentages.includes(body.percentage1) || !percentages.includes(body.percentage2) || body.percentage1 + body.percentage2 !== 100) return null;
    return {...selection,color1:body.color1,color2:body.color2,percentage1:body.percentage1,percentage2:body.percentage2};
  }
  function formula(s) {
    return s.colorMode === 'standard' ? colors.get(s.color) : `${s.percentage1} % ${colors.get(s.color1)} + ${s.percentage2} % ${colors.get(s.color2)}`;
  }
  function description(s) {
    const color = s.colorMode === 'standard' ? colors.get(s.color) : `${colors.get(s.color1)} ${s.percentage1}% + ${colors.get(s.color2)} ${s.percentage2}%`;
    return `Microcemento KAEMENTO | ${color} | ${sealers.get(s.sealer)} | ${s.quantity} ${s.quantity === 1 ? 'kit' : 'kits'}`;
  }
  function itemVariant(s) { return s.colorMode === 'standard' ? s.color : `${s.color1}:${s.percentage1}+${s.color2}:${s.percentage2}`; }
  return {colors,sealers,normalize,formula,description,itemVariant};
});
