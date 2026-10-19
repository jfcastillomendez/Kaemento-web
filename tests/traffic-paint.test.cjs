const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const {normalize,createHandler}=require('../api/red-kaemento.js');
const {createStore}=require('../api/bold/_lib/payments.cjs');
const {redisFixture}=require('./helpers/redis.cjs');
const env={KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'traffic-fixture',KAEMENTO_EMAIL_ENABLED:'true',RESEND_API_KEY:randomBytes(24).toString('hex'),KAEMENTO_EMAIL_FROM:'KAEMENTO <pedidos@example.invalid>',KAEMENTO_SALES_EMAIL:'sales@example.invalid,admin@example.invalid'};
const lead=()=>({kind:'cotizacion-trafico',requestId:randomUUID(),name:'Persona Sintética',business:'Conjunto de prueba',city:'Bogotá',project:'parqueadero',area:250.25,color:'amarillo',phone:'+57 3001234567',privacyAccepted:true,website:''});
async function invoke(body,store,transport,config=env,headers={}){
 const out={};await createHandler(config,()=>store,transport)({method:'POST',headers:{host:'preview.example',origin:'https://preview.example','content-type':'application/json',...headers},body,socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},set statusCode(v){out.status=v;},end(value){out.body=JSON.parse(value);}});return out;
}
test('Traffic quote validates consent, finite area, closed choices and contact without requiring email',()=>{
 assert.ok(normalize(lead()));assert.ok(normalize({...lead(),business:''}));
 for(const edits of [{area:0},{area:-1},{area:'250'},{area:Infinity},{area:1.001},{area:10000001},{phone:'abcdefg'},{color:'red'},{color:'__proto__'},{project:'unknown'},{name:'<script>'},{city:'\nBogotá'},{business:'x'.repeat(161)},{privacyAccepted:false},{website:'bot'},{to:'arbitrary@example.invalid'},{requestId:'invalid'}])assert.equal(normalize({...lead(),...edits}),null,JSON.stringify(edits));
});
test('Traffic quote uses existing internal recipients and sender, never echoes PII, and fails closed',async()=>{
 let mail,calls=0;const store={async claimNetwork(id,hash,payload){return {status:'claimed',payload:JSON.stringify(payload),leaseToken:'fixture'};},async finishNetwork(id,lease,ok){return ok?'sent':'failed';}};
 const transport=async(url,options)=>{calls++;mail=JSON.parse(options.body);return Response.json({id:'fixture-mail'});};
 const data=lead(),r=await invoke(data,store,transport);assert.equal(r.status,200);assert.deepEqual(r.body,{ok:true});
 assert.equal(mail.subject,'COTIZACIÓN — PINTURA DE TRÁFICO KAEMENTO');assert.deepEqual(mail.to,['sales@example.invalid','admin@example.invalid']);assert.equal(mail.reply_to,undefined);
 for(const text of ['250.25 m²','Amarillo','Bogotá','Conjunto de prueba','Pintura de Tráfico','Autorizó','+57 3001234567'])assert.ok(mail.text.includes(text),text);
 assert.ok(!JSON.stringify(r).includes(data.name));
 assert.equal((await invoke(data,store,transport,{...env,KAEMENTO_EMAIL_ENABLED:'false'})).status,503);assert.equal(calls,1);
 assert.equal((await invoke(data,store,async()=>new Response('',{status:500}))).status,503);
 assert.equal((await invoke(data,store,transport,env,{origin:'https://attacker.example'})).status,403);
});
test('Traffic quotes preserve Redis retry, concurrent idempotency and rate limiting',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try{
  const store=createStore(env,redis.transport);let count=0;const transport=async()=>{count++;return Response.json({id:'fixture-'+count});};
  const data=lead();const results=await Promise.all(Array.from({length:4},()=>invoke(data,store,transport)));assert.ok(results.some(r=>r.status===200));assert.equal(count,1);
  assert.equal((await invoke(data,store,transport)).status,200);assert.equal(count,1);
  assert.equal((await invoke({...data,color:'azul'},store,transport)).status,409);
  const second=lead();assert.equal((await invoke(second,store,async()=>new Response('',{status:503}))).status,503);
  assert.equal((await invoke(second,store,transport)).status,200);assert.equal(count,2);
  for(let i=0;i<3;i++)assert.equal((await invoke(lead(),store,transport)).status,200);
  assert.equal((await invoke(lead(),store,transport)).status,429);
 }finally{await redis.close();}
});
test('New analytics events carry only product/page context through both existing layers; never Ads conversions',()=>{
 let listener;const location={pathname:'/pintura-de-trafico',origin:'https://preview.example',hostname:'preview.example',search:''};
 const parent={postMessage(){}};const bridge={URLSearchParams,location,parent,window:{dataLayer:[],addEventListener(_,fn){listener=fn;}}};bridge.dataLayer=bridge.window.dataLayer;
 vm.runInNewContext(fs.readFileSync('analytics-bridge.js','utf8'),bridge);
 const sandbox={URL,URLSearchParams,location,document:{referrer:'',addEventListener(){}},sessionStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync('analytics.js','utf8'),sandbox);
 for(const event of ['whatsapp_click','quote_form_start','quote_form_success','distributor_request','product_document_download']){
  sandbox.window.kaementoTrack(event,{button_id:'trafico-cotizacion',email:'PRIVATE',phone:'PRIVATE',name:'PRIVATE',requestId:'PRIVATE'});
  const params=sandbox.window.dataLayer.at(-1);assert.equal(params.product_id,'pintura-de-trafico');assert.ok(!JSON.stringify(params).includes('PRIVATE'));
  listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event,params:{...params,email:'PRIVATE',phone:'PRIVATE'}}});
  const args=bridge.dataLayer.at(-1);assert.equal(args[1],event);assert.equal(args[2].product_id,'pintura-de-trafico');assert.ok(!JSON.stringify(args).includes('PRIVATE'));
 }
 const count=bridge.dataLayer.length;
 for(const event of ['purchase','conversion','generate_lead'])listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event,params:{}}});
 listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:'quote_form_success',params:{page_path:'/'}}});
 assert.equal(bridge.dataLayer.length,count);
});
test('Traffic route, metadata, navigation, images and actual quote receiver are connected',()=>{
 const html=fs.readFileSync('pintura-de-trafico.html','utf8');const routes=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.ok(routes.rewrites.some(r=>r.source==='/pintura-de-trafico'&&r.destination==='/pintura-de-trafico.html'));
 assert.equal((html.match(/<h1\b/g)||[]).length,1);assert.match(html,/canonical" href="https:\/\/www.kaemento.com\/pintura-de-trafico/);
 for(const m of html.matchAll(/(?:src|href)="(\/[^"?#]+)(?:[?#][^"]*)?"/g)){
  const file=routes.rewrites.find(r=>r.source===m[1])?.destination||m[1];assert.ok(fs.existsSync('.'+file),file);
 }
 const structured=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.ok(!JSON.stringify(structured).match(/offers|aggregateRating|review|availability/));
 assert.match(fs.readFileSync('site.js','utf8'),/form:not\(\[data-network-form\]\):not\(\[data-traffic-form\]\)/);
 assert.match(html,/data-traffic-form hidden/);assert.match(html,/name="privacyAccepted" required/);
 assert.ok(!html.includes('data-traffic-document')); // No fake download while technical PDFs are absent.
 assert.match(fs.readFileSync('sitemap.xml','utf8'),/www.kaemento.com\/pintura-de-trafico/);
 assert.equal(require('../site-search.js').search('pintura trafico')[0].href,'/pintura-de-trafico');
});
function frontend(fetch){
 const element=()=>({value:'',disabled:false,handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},setAttribute(){},removeAttribute(){},focus(){}});
 const status=element(),submit=element(),elements=Object.fromEntries(['name','business','city','project','area','color','phone','privacyAccepted','website'].map(k=>[k,element()]));
 const colors=['amarillo','blanco','negro','azul'].map(c=>({...element(),dataset:{trafficColor:c}}));
 const form={...element(),hidden:true,elements,reportValidity:()=>true,querySelector:s=>s==='[role="status"]'?status:submit,querySelectorAll:()=>Object.values(elements),reset(){Object.values(elements).forEach(el=>el.value='');}};
 const colorStatus=element(),colorLink=element(),distribution=element();const events=[],requests=[];const fixture=lead();
 const context={document:{querySelector:s=>s==='[data-traffic-form]'?form:distribution,querySelectorAll:s=>s==='[data-traffic-color]'?colors:[],getElementById:id=>id==='traffic-color-status'?colorStatus:colorLink},window:{kaementoTrack:(...args)=>events.push(args)},FormData:class{get(k){return fixture[k];}has(k){return !!fixture[k];}},crypto:{randomUUID},AbortSignal:{timeout(){}},fetch:async(url,init)=>{requests.push(JSON.parse(init.body));return fetch(url,init);},encodeURIComponent};
 vm.runInNewContext(fs.readFileSync('pintura-trafico.js','utf8'),context);
 return {form,status,events,requests,fixture,colors,colorLink,submit:()=>form.handlers.submit({preventDefault(){}})};
}
test('Browser failure keeps details and UUID; success alone emits one quote event; color is shared with form',async()=>{
 let succeed=false;const ui=frontend(async()=>({ok:succeed,status:succeed?200:503,json:async()=>({ok:true})}));
 ui.colors[3].handlers.click();assert.equal(ui.form.elements.color.value,'azul');assert.equal(ui.colorLink.href,'#comprar-trafico');assert.match(ui.colorLink.textContent,/Comprar azul/);
 await ui.submit();assert.equal(ui.events.filter(e=>e[0]==='quote_form_success').length,0);assert.match(ui.status.textContent,/No pudimos confirmar/);
 const id=ui.requests[0].requestId;succeed=true;await ui.submit();assert.equal(ui.requests[1].requestId,id);assert.equal(ui.events.filter(e=>e[0]==='quote_form_success').length,1);assert.match(ui.status.textContent,/Solicitud enviada/);
});
test('Browser rejects fake 200 success and prevents concurrent submits',async()=>{
 let resolve;const ui=frontend(()=>new Promise(r=>{resolve=r;}));const first=ui.submit();await ui.submit();assert.equal(ui.requests.length,1);resolve({ok:true,status:200,json:async()=>({ok:false})});await first;assert.equal(ui.events.length,0);assert.match(ui.status.textContent,/No pudimos confirmar/);
});
