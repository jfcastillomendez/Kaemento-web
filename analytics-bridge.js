function validCheckoutVariant(value) {
  const colors = ['extra-blanco','arena','gris-cemento','negro','terracota'];
  if (colors.includes(value)) return true;
  if (typeof value !== 'string') return false;
  const match = /^([a-z-]+):(10|20|30|40|50|60|70|80|90)\+([a-z-]+):(10|20|30|40|50|60|70|80|90)$/.exec(value);
  return !!match && colors.includes(match[1]) && colors.includes(match[3]) && match[1] !== match[3] && Number(match[2]) + Number(match[4]) === 100;
}
// generate_lead is disabled until a real receiving integration confirms delivery.
// The flag is local and explicit. Ordinary browsing never enables debug mode.
const debugSignal = new URLSearchParams(location.search).get('gtm_debug');
const debugSession = ['127.0.0.1', 'localhost'].includes(location.hostname) && /^(?:x|[0-9]{1,16})$/.test(debugSignal || '');
const debugOptions = debugSession ? {debug_mode:true} : {};
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config','G-XYVF450MJE',{...debugOptions,send_page_view:false,page_location:'https://www.kaemento.com/',page_referrer:'',allow_google_signals:false,allow_ad_personalization_signals:false});
const adsLanding = new URLSearchParams();
for (const key of ['gclid','gbraid','wbraid']) {
  const value = new URLSearchParams(location.search).get(key);
  if (value && /^[A-Za-z0-9_-]{10,512}$/.test(value)) adsLanding.set(key,value);
}
gtag('config','AW-18358591293',{...debugOptions,send_page_view:false,page_location:'https://www.kaemento.com/' + (adsLanding.size ? '?' + adsLanding.toString() : ''),page_referrer:'',allow_ad_personalization_signals:false});
// Ads purchases have a separate backend-authorized path in analytics-purchase.js.
const allowedEvents=new Set(['page_view','phone_click','whatsapp_click','microcemento_cta_click','microcemento_catalog_download','microcemento_manual_download','microcemento_form_start','begin_checkout','add_to_cart','remove_from_cart','view_cart','view_item','select_promotion','view_promotion']);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='kaemento-event' || !allowedEvents.has(event.data.event))return;
 const p=event.data.params || {}, safe={};
 if(debugSession)safe.debug_mode=true;
 for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','button_id']) if(typeof p[key]==='string'&&/^[a-z][a-z0-9_-]{0,79}$/i.test(p[key])&&!/\d{7,}/.test(p[key]))safe[key]=p[key];
 if(typeof p.page_path==='string'&&/^\/[a-z0-9/_\-.]*$/i.test(p.page_path)){safe.page_path=p.page_path;safe.page_location='https://www.kaemento.com'+p.page_path;}
 if(typeof p.source_host==='string'&&/^[a-z0-9.-]+$/i.test(p.source_host))safe.page_referrer='https://'+p.source_host+'/';
 if(p.lead_stage==='whatsapp_handoff')safe.lead_stage=p.lead_stage;
 if (['select_promotion','view_promotion'].includes(event.data.event)) {
   if (p.promotion_name !== 'microcemento_kaemento_launch_2026') return;
   safe.promotion_name = 'microcemento_kaemento_launch_2026';
 }
 if (['begin_checkout','add_to_cart','remove_from_cart','view_cart'].includes(event.data.event)) {
   if (!Array.isArray(p.items) || !p.items.length || p.items.length > 20) return;
   const items = [];
   let quantity = 0;
   for (const item of p.items) {
     if (!item || !validCheckoutVariant(item.item_variant) || !['mate','brillante'].includes(item.sealer_type) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) return;
     quantity += item.quantity;
     items.push({item_id:'microcemento-kaemento',item_name:'Microcemento KAEMENTO',price:365500,quantity:item.quantity,item_variant:item.item_variant,sealer_type:item.sealer_type});
   }
   if (quantity > 20 || p.currency !== 'COP' || p.value !== 365500 * quantity) return;
   safe.currency = 'COP'; safe.value = 365500 * quantity; safe.items = items;
 }
 if (event.data.event === 'view_item') {
   safe.currency = 'COP'; safe.value = 365500;
   safe.items = [{item_id:'microcemento-kaemento',item_name:'Microcemento KAEMENTO',price:365500}];
 }
 gtag('event',event.data.event,safe);
});
parent.postMessage('kaemento-analytics-ready',location.origin);
