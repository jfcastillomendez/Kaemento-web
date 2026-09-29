// Shared, public variant rules. No credentials or payment signing logic.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaementoBoldConfig = factory();
})(typeof window === 'object' ? window : globalThis, () => {
  const colors = new Map([['extra-blanco','Extra Blanco'],['arena','Arena'],['gris-cemento','Gris Cemento'],['negro','Negro Profundo'],['terracota','Terracota']]);
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
  const unitPrice = 365500;
  const kitCount = selection => selection.items ? selection.items.reduce((n, item) => n + item.quantity, 0) : selection.quantity;
  const lines = selection => selection.items || [selection];
  function lineKey(item) {
    const color = item.colorMode === 'standard' ? item.color : [[item.color1,item.percentage1],[item.color2,item.percentage2]].sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x.join(':')).join('+');
    return item.colorMode + '|' + color + '|' + item.sealer;
  }
  function normalizeCart(body) {
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return null;
    const items = [], keys = new Map();
    for (const raw of body.items) {
      const item = normalize(raw);
      if (!item) return null;
      const key = lineKey(item), previous = keys.get(key);
      if (previous) previous.quantity += item.quantity;
      else { keys.set(key,item); items.push(item); }
    }
    const selection = {items};
    return kitCount(selection) <= 20 ? selection : null;
  }
  // Public requests are strict; restore projects stored non-personal selections through the same rules.
  const normalizeOrder = body => Object.hasOwn(body || {}, 'items') ? normalizeCart(body) : normalize(body);
  function restore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return Object.hasOwn(value,'items') ? normalizeCart({items:Array.isArray(value.items) ? value.items.map(item=>({productId:'microcemento-kaemento-launch',...item})) : null}) : normalize({productId:'microcemento-kaemento-launch',...value});
  }
  function orderDescription(selection) {
    if (!selection.items) return description(selection);
    const detail='Microcemento KAEMENTO | '+selection.items.map(item=>`${item.quantity} ${formula(item)} ${sealers.get(item.sealer)}`).join(' + ');
    return detail.length<=100 ? detail : `Microcemento KAEMENTO | ${kitCount(selection)} kits | ${selection.items.length} configuraciones`;
  }
  const analyticsItems = selection => lines(selection).map(item=>({item_id:'microcemento-kaemento',item_name:'Microcemento KAEMENTO',price:unitPrice,quantity:item.quantity,item_variant:itemVariant(item),sealer_type:item.sealer}));
  return {colors,sealers,normalize,formula,description,itemVariant,unitPrice,kitCount,lines,lineKey,normalizeCart,normalizeOrder,restore,orderDescription,analyticsItems};
});
