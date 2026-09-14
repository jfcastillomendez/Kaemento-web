// The flag is local and explicit. Ordinary browsing never enables debug mode.
const debugSignal = new URLSearchParams(location.search).get('gtm_debug');
const debugSession = ['127.0.0.1', 'localhost'].includes(location.hostname) && /^(?:x|[0-9]{1,16})$/.test(debugSignal || '');
const debugOptions = debugSession ? {debug_mode:true} : {};
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config','G-XYVF450MJE',{...debugOptions,send_page_view:false,page_location:'https://www.kaemento.com/',page_referrer:'',allow_google_signals:false,allow_ad_personalization_signals:false});
gtag('config','AW-18358591293',{...debugOptions,send_page_view:false,page_location:'https://www.kaemento.com/',page_referrer:'',allow_ad_personalization_signals:false});
// An Ads conversion label can be connected here after it is confirmed. No placeholder send_to.
const allowedEvents=new Set(['page_view','whatsapp_click','microcemento_cta_click','microcemento_whatsapp_click','microcemento_catalog_download','microcemento_manual_download','microcemento_form_start','generate_lead']);
window.addEventListener('message',event=>{
 if(event.origin!==location.origin || event.source!==parent || event.data?.type!=='kaemento-event' || !allowedEvents.has(event.data.event))return;
 const p=event.data.params || {}, safe={};
 if(debugSession)safe.debug_mode=true;
 for(const key of ['utm_source','utm_medium','utm_campaign','utm_content','button_id']) if(typeof p[key]==='string'&&/^[a-z][a-z0-9_-]{0,79}$/i.test(p[key])&&!/\d{7,}/.test(p[key]))safe[key]=p[key];
 if(typeof p.page_path==='string'&&/^\/[a-z0-9/_\-.]*$/i.test(p.page_path)){safe.page_path=p.page_path;safe.page_location='https://www.kaemento.com'+p.page_path;}
 if(typeof p.source_host==='string'&&/^[a-z0-9.-]+$/i.test(p.source_host))safe.page_referrer='https://'+p.source_host+'/';
 if(p.lead_stage==='whatsapp_handoff')safe.lead_stage=p.lead_stage;
 gtag('event',event.data.event,safe);
});
parent.postMessage('kaemento-analytics-ready',location.origin);
