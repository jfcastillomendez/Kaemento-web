// Shared, public variant rules. No credentials or payment signing logic.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaementoBoldConfig = factory();
})(typeof window === 'object' ? window : globalThis, () => {
  const colors = new Map([['extra-blanco','Extra Blanco'],['arena','Arena'],['gris-cemento','Gris Cemento'],['negro','Negro Profundo'],['terracota','Terracota']]);
  const sealers = new Map([['mate','Mate'],['brillante','Brillante']]);
  const surfaces = new Map([['floor','Piso'],['walls','Muros'],['both','Piso y muros']]);
  const percentages = [10,20,30,40,50,60,70,80,90];
  const trafficPrice = 108885;
  const isTraffic = s => s?.productId === 'pintura-trafico';
  function normalizeTraffic(body) {
    if (!isTraffic(body) || Object.keys(body).length !== 2 || !Array.isArray(body.items) || !body.items.length || body.items.length > 2) return null;
    const counts = new Map();
    for (const item of body.items) {
      if (!item || Object.keys(item).length !== 2 || !['amarillo','negro'].includes(item.color) || !validQuantity(item.quantity) || counts.has(item.color)) return null;
      counts.set(item.color,item.quantity);
    }
    const items = [...counts].sort(([a],[b])=>a.localeCompare(b)).map(([color,quantity])=>({color,quantity}));
    return validQuantity(items.reduce((n,x)=>n+x.quantity,0)) ? {productId:'pintura-trafico',items} : null;
  }
  const trafficColor = color => ({amarillo:'Amarillo',negro:'Negro'})[color];
  function normalize(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || body.productId !== 'microcemento-kaemento-launch' ||
        !validQuantity(body.quantity) || !sealers.has(body.sealer)) return null;
    const shared = ['productId','quantity','colorMode','sealer'];
    if (Object.hasOwn(body,'surface')) {if (!surfaces.has(body.surface)) return null;shared.push('surface');}
    const fields = body.colorMode === 'standard' ? [...shared,'color'] : body.colorMode === 'mix' ? [...shared,'color1','color2','percentage1','percentage2'] : [];
    if (!fields.length || Object.keys(body).length !== fields.length || !fields.every(k => Object.hasOwn(body,k))) return null;
    const selection = { quantity: body.quantity, colorMode: body.colorMode, sealer: body.sealer, ...(body.surface ? {surface:body.surface} : {}) };
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
    return `Microcemento KAEMENTO | ${s.surface ? surfaces.get(s.surface)+' | ' : ''}${color} | ${sealers.get(s.sealer)} | ${s.quantity} ${s.quantity === 1 ? 'kit' : 'kits'}`;
  }
  function itemVariant(s) { return s.colorMode === 'standard' ? s.color : `${s.color1}:${s.percentage1}+${s.color2}:${s.percentage2}`; }
  const unitPrice = 365500;
  const regularPrice = 430000;
  // No commercial kit cap. Keep quantity and totals exactly representable in COP,
  // including regular pricing and Redis JSON's 14 significant digits.
  const validQuantity = quantity => Number.isSafeInteger(quantity) && quantity > 0 && Number.isSafeInteger(quantity * regularPrice) && quantity * regularPrice < 1e14;
  const kitCount = selection => selection.items ? selection.items.reduce((n, item) => n + item.quantity, 0) : selection.quantity;
  const lines = selection => selection.items || [selection];
  function lineKey(item) {
    const color = item.colorMode === 'standard' ? item.color : [[item.color1,item.percentage1],[item.color2,item.percentage2]].sort((a,b)=>a[0].localeCompare(b[0])).map(x=>x.join(':')).join('+');
    return item.colorMode + '|' + color + '|' + item.sealer + '|' + (item.surface || '');
  }
  function normalizeCart(body) {
    if (!body || Array.isArray(body) || Object.keys(body).length !== 1 || !Array.isArray(body.items) || body.items.length < 1) return null;
    const items = [], keys = new Map();
    for (const raw of body.items) {
      const item = normalize(raw);
      if (!item) return null;
      const key = lineKey(item), previous = keys.get(key);
      if (previous) previous.quantity += item.quantity;
      else { keys.set(key,item); items.push(item); }
    }
    const selection = {items};
    return validQuantity(kitCount(selection)) ? selection : null;
  }
  // Public requests are strict; restore projects stored non-personal selections through the same rules.
  const normalizeOrder = body => isTraffic(body) ? normalizeTraffic(body) : Object.hasOwn(body || {}, 'items') ? normalizeCart(body) : normalize(body);
  function restore(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (isTraffic(value)) return normalizeTraffic(value);
    return Object.hasOwn(value,'items') ? normalizeCart({items:Array.isArray(value.items) ? value.items.map(item=>({productId:'microcemento-kaemento-launch',...item})) : null}) : normalize({productId:'microcemento-kaemento-launch',...value});
  }
  function orderDescription(selection) {
    if (isTraffic(selection)) return 'Pintura Tráfico KAEMENTO | '+selection.items.map(x=>x.quantity+' gal '+trafficColor(x.color)).join(' + ');
    if (!selection.items) {
      const detail = description(selection);
      return detail.length <= 100 ? detail : `Microcemento KAEMENTO | ${selection.quantity} kits | ${surfaces.get(selection.surface) || 'Sistema completo'} | ${sealers.get(selection.sealer)}`;
    }
    const detail='Microcemento KAEMENTO | '+selection.items.map(item=>`${item.quantity} ${formula(item)} ${sealers.get(item.sealer)}`).join(' + ');
    return detail.length<=100 ? detail : `Microcemento KAEMENTO | ${kitCount(selection)} kits | ${selection.items.length} configuraciones`;
  }
  const analyticsItems = (selection, price = unitPrice) => lines(selection).map(item=>({item_id:'microcemento-kaemento',item_name:'Microcemento KAEMENTO',price,quantity:item.quantity,item_variant:itemVariant(item),sealer_type:item.sealer}));
  return {trafficPrice,isTraffic,normalizeTraffic,trafficColor,colors,sealers,surfaces,normalize,formula,description,itemVariant,unitPrice,regularPrice,validQuantity,kitCount,lines,lineKey,normalizeCart,normalizeOrder,restore,orderDescription,analyticsItems};
});
