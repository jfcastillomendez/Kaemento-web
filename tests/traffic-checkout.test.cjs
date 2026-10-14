const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID,createHmac}=require('node:crypto');
const variants=require('../bold-config.js');
const orders=require('../api/bold/_lib/orders.cjs');
const payments=require('../api/bold/_lib/payments.cjs');
const {createCheckout}=require('../api/bold/checkout.js');
const {createConversion}=require('../api/bold/conversion.js');
const {emailContent}=require('../api/bold/_lib/order-emails.cjs');
const {customer}=require('./helpers/orders.cjs');
const {redisFixture}=require('./helpers/redis.cjs');
const selection={productId:'pintura-trafico',items:[{color:'amarillo',quantity:12},{color:'negro',quantity:8}]};
const env={VERCEL_ENV:'production',BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:'fixture-public',BOLD_SECRET_KEY:randomBytes(32).toString('hex'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'local-fixture',BOLD_STORAGE_NAMESPACE:'traffic-test'};
async function invoke(handler,body,id=randomUUID()) {const result={};await handler({method:'POST',headers:{'content-type':'application/json','idempotency-key':id,host:'fixture.invalid',origin:'https://fixture.invalid'},body},{setHeader(){},set statusCode(v){result.status=v;},end(s){result.body=JSON.parse(s);}});return result;}
test('Traffic prices are final tax-inclusive, strict colors and no commercial quantity cap',()=>{
 assert.equal(variants.trafficPrice,108885);
 assert.equal(variants.normalizeTraffic({...selection,items:[{color:'negro',quantity:21}]}).items[0].quantity,21);
 assert.equal(orders.checkoutInput({...selection,customer,expectedUnitPrice:96787}),null);
 for(const items of [[{color:'blanco',quantity:1}],[{color:'azul',quantity:1}],[{color:'negro',quantity:-1}],[{color:'negro',quantity:1.5}],[{color:'negro',quantity:1,price:1}],[{color:'negro',quantity:1},{color:'negro',quantity:2}]])assert.equal(orders.checkoutInput({...selection,items,customer}),null);
 assert.equal(orders.checkoutInput({...selection,customer,amount:1}),null);
});
test('Traffic checkout persists signed totals; webhook alone confirms; retry, emails and Ads remain idempotent',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();const factory=()=>payments.createStore(env,redis.transport);
 try {
  // Force microcemento launch sold out: traffic price and counter must be independent.
  for(let i=0;i<40;i++)await redis.command(['SADD','kaemento:traffic-test:campaign:confirmed-orders','historic-'+i]);
  const checkout=createCheckout(env,factory),requestId=randomUUID(),body={...selection,customer,expectedUnitPrice:108885};
  const outputs=await Promise.all(Array.from({length:5},()=>invoke(checkout,body,requestId)));
  assert.ok(outputs.every(x=>x.status===200));assert.equal(new Set(outputs.map(x=>x.body.orderId)).size,1);
  const out=outputs[0].body;assert.equal(out.amount,2177700);assert.match(out.orderId,/^KAE-TRAFICO-/);
  const saved=await factory().readOrder(out.orderId);assert.equal(saved.total,out.amount);assert.equal(saved.customerEmail,customer.email);assert.equal(saved.paymentStatus,'pending');assert.equal(saved.promotion,'pintura_trafico_launch_20');
  assert.equal(saved.items[0].subtotal,1306620);assert.equal(saved.invoiceStatus,'pending');assert.equal(saved.invoiceNumber,null);assert.equal(saved.cufe,null);
  const conversion=createConversion(env,factory),prepare=()=>invoke(conversion,{action:'prepare',orderId:out.orderId,token:out.statusToken});
  assert.equal((await prepare()).body.status,'not_paid');
  const {handle}=await import('../api/bold/webhook.mjs');
  async function webhook(type='SALE_APPROVED',amount=out.amount,valid=true) {
   const raw=JSON.stringify({id:'event-'+type+'-'+amount,type,data:{payment_id:'traffic-fixture',metadata:{reference:out.orderId},amount:{currency:'COP',total:amount}}});
   const sig=createHmac('sha256',env.BOLD_SECRET_KEY).update(Buffer.from(raw).toString('base64')).digest('hex');
   return handle(new Request('https://fixture.invalid/api/bold/webhook',{method:'POST',headers:{'content-type':'application/json','x-bold-signature':valid?sig:'0'.repeat(64)},body:raw}),env,factory);
  }
  assert.equal((await webhook('SALE_APPROVED',out.amount,false)).status,401);
  assert.equal((await webhook('SALE_APPROVED',1)).status,422);
  await webhook('SALE_REJECTED');assert.equal((await prepare()).body.status,'not_paid');
  await webhook();await webhook();
  const {createStatus}=require('../api/bold/status.js');
  const result=await invoke(createStatus(env,factory),{orderId:out.orderId,token:out.statusToken});assert.equal(result.body.paymentStatus,'paid');assert.deepEqual(result.body.selection,selection);assert.ok(!JSON.stringify(result.body).includes(customer.email));
  const paid=await factory().readOrder(out.orderId);assert.equal(paid.paymentStatus,'paid');assert.equal(await factory().confirmedCampaignOrders(),40);
  for(const role of ['customer','sales']) {const mail=emailContent(paid,role);assert.match(mail.text,/Pintura de Tráfico KAEMENTO/);assert.match(mail.text,/Amarillo/);assert.match(mail.text,/Negro/);assert.doesNotMatch(mail.text,/Sellador|Microcemento|48 horas|undefined/);}
  const prepared=await prepare();assert.equal(prepared.body.status,'prepared');
  const results=await Promise.all(Array.from({length:10},()=>invoke(conversion,{action:'consume',orderId:out.orderId,ticket:prepared.body.ticket})));
  assert.equal(results.filter(x=>x.body.status==='authorized').length,1);assert.equal(results.find(x=>x.body.status==='authorized').body.conversion.value,2177700);
  assert.equal((await prepare()).body.status,'already_issued');
  assert.equal((await invoke(checkout,body,requestId)).status,409);
  assert.equal(await redis.command(['ZCARD','kaemento:traffic-test:email:due']),2);
  const job=await factory().claimEmail(out.orderId,'customer',{text:'fixture'},true);assert.equal(job.status,'claimed');
  assert.equal(await factory().finishEmail(out.orderId,'customer',job.job.leaseToken,{ok:false,errorCode:'fixture_timeout'}),'failed');
  assert.equal((await factory().readOrder(out.orderId)).paymentStatus,'paid');
  const retry=await factory().claimEmail(out.orderId,'customer',{text:'changed'},true);assert.equal(retry.job.payload,job.job.payload);
  await factory().finishEmail(out.orderId,'customer',retry.job.leaseToken,{ok:true,providerId:'fixture'});
  assert.equal((await factory().claimEmail(out.orderId,'customer',null,true)).status,'sent');
 } finally {await redis.close();}
});
test('Browser prepares only validated totals, retains retry identity and opens Bold with persisted reference',async()=>{
 const vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto').webcrypto;
 const el=value=>({value,handlers:{},addEventListener(k,fn){this.handlers[k]=fn;}});
 const yellow=el('0'),black=el('0'),buy=el(),status=el(),total=el(),events={},saved=new Map(),requests=[],opens=[];
 yellow.name='amarillo';black.name='negro';
 const panel={querySelector:s=>({'[name="amarillo"]':yellow,'[name="negro"]':black,'[data-traffic-buy]':buy,'[role="status"]':status,'[data-traffic-total]':total})[s]};
 let invalid=false;
 const context={Intl,TextEncoder,Uint8Array,crypto,AbortSignal,location:{origin:'https://fixture.invalid'},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},document:{getElementById:()=>panel},window:{KaementoBoldConfig:variants,addEventListener:(k,f)=>events[k]=f,KaementoOrderCustomer:{open:async(s,prepare)=>prepare(customer)},BoldCheckout:class{constructor(c){this.config=c;}async open(){opens.push(this.config);}}},fetch:async(url,options)=>{
  requests.push(options);const input=JSON.parse(options.body),s=variants.normalizeTraffic({productId:input.productId,items:input.items});
  return {ok:true,json:async()=>({orderId:'KAE-TRAFICO-1800000000000-1234567890abcdef',amount:invalid?1:variants.kitCount(s)*108885,unitPrice:108885,currency:'COP',tax:'vat-19',apiKey:'fixture',integritySignature:'a'.repeat(64),statusToken:'b'.repeat(64),selection:s,description:'Pintura'})};
 }};
 vm.runInNewContext(fs.readFileSync('pintura-compra.js','utf8'),context);
 assert.equal(buy.disabled,true);yellow.value='21';black.value='2';yellow.handlers.input();assert.equal(buy.disabled,false);
 invalid=true;await buy.handlers.click();assert.equal(opens.length,0);assert.equal(saved.size,0);
 invalid=false;await buy.handlers.click();assert.equal(opens.length,1);assert.equal(opens[0].amount,'2504355');assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
 assert.ok(saved.has('kaemento-order-access'));assert.ok(!JSON.stringify([...saved]).includes(customer.email));
 events.pagehide();assert.equal(yellow.value,'0');assert.equal(black.value,'0');assert.equal(buy.disabled,true);
});
