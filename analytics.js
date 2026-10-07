// generate_lead is disabled until a real receiving integration confirms delivery.
/* Only technical context reaches Google. Google tags live in an isolated document
   with no access to form DOM, WhatsApp URLs or user-entered content. */
(() => {
function validCheckoutVariant(value) {
  const colors = ['extra-blanco','arena','gris-cemento','negro','terracota'];
  if (colors.includes(value)) return true;
  if (typeof value !== 'string') return false;
  const match = /^([a-z-]+):(10|20|30|40|50|60|70|80|90)\+([a-z-]+):(10|20|30|40|50|60|70|80|90)$/.exec(value);
  return !!match && colors.includes(match[1]) && colors.includes(match[3]) && match[1] !== match[3] && Number(match[2]) + Number(match[4]) === 100;
}
  const allowed = new Set(['page_view','phone_click','whatsapp_click','microcemento_cta_click','microcemento_catalog_download','microcemento_manual_download','microcemento_form_start','begin_checkout','add_to_cart','remove_from_cart','view_cart','view_item','select_promotion','view_promotion']);
  // Explicit, page-scoped test signal; never persist it or copy the full query.
  const debugSignal = new URLSearchParams(location.search).get('gtm_debug');
  const debugSession = ['127.0.0.1', 'localhost'].includes(location.hostname) && /^(?:x|[0-9]{1,16})$/.test(debugSignal || '');
  const keys = ['utm_source','utm_medium','utm_campaign','utm_content'];
  const cleanPath = location.pathname.replace(/[^a-zA-Z0-9/_\-.]/g,'').slice(0,160);
  const context = { page_path: cleanPath, page_location: 'https://www.kaemento.com' + cleanPath };
  // Only campaign slugs, never arbitrary query values (emails, phones, sentences).
  function campaign(value) { return value && /^[a-z][a-z0-9_-]{0,63}$/i.test(value) && !/\d{7,}/.test(value) ? value : undefined; }
  try {
    const search = new URLSearchParams(location.search);
    const saved = JSON.parse(sessionStorage.getItem('kaemento-campaign') || '{}');
    keys.forEach(key => { const value = campaign(search.get(key) || saved[key]); if (value) context[key] = value; });
    sessionStorage.setItem('kaemento-campaign', JSON.stringify(Object.fromEntries(keys.filter(k=>context[k]).map(k=>[k,context[k]]))));
    if (document.referrer) context.source_host = new URL(document.referrer).hostname;
  } catch (_) { /* Storage is optional. */ }
  window.dataLayer = window.dataLayer || [];
  let frame, ready = false;
  const queue = [];
  // Pass only Google's opaque click identifiers to the existing same-origin tag document.
  // Never forward the result URL, order reference, buyer token or arbitrary query strings.
  const adsClick = new URLSearchParams();
  const landingSearch = new URLSearchParams(location.search);
  for (const key of ['gclid','gbraid','wbraid']) {
    const value = landingSearch.get(key);
    if (value && /^[A-Za-z0-9_-]{10,512}$/.test(value)) adsClick.set(key,value);
  }
  function send(event, values = {}) {
    if (!allowed.has(event)) return;
    const payload = { ...context };
    if (/^[a-z0-9_-]{1,80}$/.test(values.button_id || '')) payload.button_id = values.button_id;
    if (values.lead_stage === 'whatsapp_handoff') payload.lead_stage = 'whatsapp_handoff';
    if (['select_promotion','view_promotion'].includes(event)) {
      if (values.promotion_name !== 'microcemento_kaemento_launch_2026') return;
      payload.promotion_name = 'microcemento_kaemento_launch_2026';
    }
    if (['begin_checkout','add_to_cart','remove_from_cart','view_cart'].includes(event)) {
      if (!Array.isArray(values.items) || !values.items.length || values.items.length > 20) return;
      const items = [];
      let quantity = 0;
      for (const item of values.items) {
        if (!item || !validCheckoutVariant(item.item_variant) || !['mate','brillante'].includes(item.sealer_type) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) return;
        quantity += item.quantity;
        items.push({item_id:'microcemento-kaemento',item_name:'Microcemento KAEMENTO',price:365500,quantity:item.quantity,item_variant:item.item_variant,sealer_type:item.sealer_type});
      }
      if (quantity > 20 || values.currency !== 'COP' || values.value !== 365500 * quantity) return;
      payload.currency = 'COP'; payload.value = 365500 * quantity; payload.items = items;
    }
    if (event === 'view_item') {
      payload.currency = 'COP'; payload.value = 365500;
      payload.items = [{item_id:'microcemento-kaemento',item_name:'Microcemento KAEMENTO',price:365500}];
    }
    window.dataLayer.push({event, ...payload});
    const message = {type:'kaemento-event', event, params:payload};
    if (ready) frame.contentWindow.postMessage(message, location.origin); else queue.push(message);
  }
  window.kaementoTrack = send;
  // Deliberately no general-purpose gtag forwarding API in the parent page.
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame?.contentWindow || event.data !== 'kaemento-analytics-ready') return;
    ready = true; queue.splice(0).forEach(m=>frame.contentWindow.postMessage(m,location.origin));
  });
  document.addEventListener('DOMContentLoaded', () => {
    if (debugSession) adsClick.set('gtm_debug',debugSignal);
    frame=document.createElement('iframe'); frame.src='/analytics-bridge.html' + (adsClick.size ? '?' + adsClick.toString() : ''); frame.hidden=true; frame.referrerPolicy='no-referrer'; frame.title='Medición técnica'; frame.setAttribute('aria-hidden','true'); document.body.appendChild(frame);
    send('page_view');
    if (location.pathname === '/productos/microcemento-kaemento.html') send('view_item');
  });
})();
