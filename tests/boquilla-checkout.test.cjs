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
const selection={productId:'boquilla-magica',items:[{color:'beige',quantity:12},{color:'negra',quantity:8}]};
const env={VERCEL_ENV:'production',BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:'fixture-public',BOLD_SECRET_KEY:randomBytes(32).toString('hex'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'local-fixture',BOLD_STORAGE_NAMESPACE:'boquilla-test'};
async function invoke(handler,body,id=randomUUID()) {const result={};await handler({method:'POST',headers:{'content-type':'application/json','idempotency-key':id,host:'fixture.invalid',origin:'https://fixture.invalid'},body},{setHeader(){},set statusCode(v){result.status=v;},end(s){result.body=JSON.parse(s);}});return result;}
test('Boquilla checkout persists signed totals; webhook alone confirms; retry, emails and Ads remain idempotent',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();const factory=()=>payments.createStore(env,redis.transport);
 try {
  // Force microcemento launch sold out: traffic price and counter must be independent.
  for(let i=0;i<40;i++)await redis.command(['SADD','kaemento:boquilla-test:campaign:confirmed-orders','historic-'+i]);
  const checkout=createCheckout(env,factory),requestId=randomUUID(),body={...selection,customer,expectedUnitPrice:44000};
  const outputs=await Promise.all(Array.from({length:5},()=>invoke(checkout,body,requestId)));
  assert.ok(outputs.every(x=>x.status===200));assert.equal(new Set(outputs.map(x=>x.body.orderId)).size,1);
  const out=outputs[0].body;assert.equal(out.amount,880000);assert.match(out.orderId,/^KAE-BOQUILLA-/);
  const saved=await factory().readOrder(out.orderId);assert.equal(saved.total,out.amount);assert.equal(saved.customerEmail,customer.email);assert.equal(saved.paymentStatus,'pending');assert.equal(saved.promotion,'boquilla_magica_launch_15');
  assert.equal(saved.items[0].subtotal,528000);assert.equal(saved.invoiceStatus,'pending');assert.equal(saved.invoiceNumber,null);assert.equal(saved.cufe,null);
  const conversion=createConversion(env,factory),prepare=()=>invoke(conversion,{action:'prepare',orderId:out.orderId,token:out.statusToken});
  assert.equal((await prepare()).body.status,'not_paid');
  const {handle}=await import('../api/bold/webhook.mjs');
  async function webhook(type='SALE_APPROVED',amount=out.amount,valid=true) {
   const raw=JSON.stringify({id:'event-'+type+'-'+amount,type,data:{payment_id:'boquilla-fixture',metadata:{reference:out.orderId},amount:{currency:'COP',total:amount}}});
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
  for(const role of ['customer','sales']) {const mail=emailContent(paid,role);assert.match(mail.text,/Boquilla Mágica KAEMENTO/);assert.match(mail.text,/Beige/);assert.match(mail.text,/Negra/);assert.doesNotMatch(mail.text,/Sellador|Microcemento|48 horas|undefined/);}
  const prepared=await prepare();assert.equal(prepared.body.status,'prepared');
  const results=await Promise.all(Array.from({length:10},()=>invoke(conversion,{action:'consume',orderId:out.orderId,ticket:prepared.body.ticket})));
  assert.equal(results.filter(x=>x.body.status==='authorized').length,1);assert.equal(results.find(x=>x.body.status==='authorized').body.conversion.value,880000);
  assert.equal((await prepare()).body.status,'already_issued');
  assert.equal((await invoke(checkout,body,requestId)).status,409);
  assert.equal(await redis.command(['ZCARD','kaemento:boquilla-test:email:due']),2);
  const job=await factory().claimEmail(out.orderId,'customer',{text:'fixture'},true);assert.equal(job.status,'claimed');
  assert.equal(await factory().finishEmail(out.orderId,'customer',job.job.leaseToken,{ok:false,errorCode:'fixture_timeout'}),'failed');
  assert.equal((await factory().readOrder(out.orderId)).paymentStatus,'paid');
  const retry=await factory().claimEmail(out.orderId,'customer',{text:'changed'},true);assert.equal(retry.job.payload,job.job.payload);
  await factory().finishEmail(out.orderId,'customer',retry.job.leaseToken,{ok:true,providerId:'fixture'});
  assert.equal((await factory().claimEmail(out.orderId,'customer',null,true)).status,'sent');
 } finally {await redis.close();}
});

test('Boquilla rejects changed prices, injected totals, unsupported colors and quantities; all five colors cost 44000',()=>{
 assert.equal(variants.boquillaRegularPrice,51900);assert.equal(variants.boquillaPrice,44000);
 const all=variants.normalizeBoquilla({productId:'boquilla-magica',items:[...variants.boquillaColors.keys()].map(color=>({color,quantity:21}))});
 assert.ok(all);assert.equal(orders.record('fixture',all,customer).total,4620000);
 assert.ok(variants.orderDescription(all).length<=100);
 for(const expectedUnitPrice of [1,44115,51900,365500])assert.equal(orders.checkoutInput({...selection,customer,expectedUnitPrice}),null);
 for(const items of [[{color:'roja',quantity:1}],[{color:'gris',quantity:0}],[{color:'gris',quantity:1.5}],[{color:'gris',quantity:1,price:1}],[{color:'gris',quantity:1},{color:'gris',quantity:2}]])assert.equal(orders.checkoutInput({...selection,items,customer}),null);
 assert.equal(orders.checkoutInput({...selection,customer,amount:1}),null);
 const record=payments.orderRecord('KAE-BOQUILLA-1800000000000-1234567890abcdef',selection,customer);
 assert.equal(payments.purchaseEvent(record),null);
 assert.equal(payments.purchaseEvent({...record,status:'rejected',paymentId:'fixture'}),null);
 const purchase=payments.purchaseEvent({...record,status:'approved',paymentId:'fixture'});
 assert.equal(purchase.params.value,880000);assert.equal(purchase.params.items[0].item_id,'boquilla-magica');
});
test('Boquilla browser cart persists variants, validates backend totals and reuses retry identity without contacting Bold',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const el=(value='')=>({value,handlers:{},children:[],addEventListener(k,fn){this.handlers[k]=fn;},setAttribute(){},reportValidity(){return true;},append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}});
 const color=el('beige'),quantity=el('2'),add=el(),buy=el(),status=el(),list=el(),total=el(),saved=new Map(),session=new Map(),events={},requests=[],opens=[];
 const panel={querySelector:s=>({'[data-boquilla-color]':color,'[data-boquilla-quantity]':quantity,'[data-boquilla-add]':add,'[data-boquilla-buy]':buy,'[data-boquilla-status]':status,'[data-boquilla-cart]':list,'[data-boquilla-total]':total})[s]};
 let invalid=true;
 const context={Intl,TextEncoder,Uint8Array,crypto:require('node:crypto').webcrypto,AbortSignal,location:{origin:'https://fixture.invalid'},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},document:{getElementById:()=>panel,createElement:()=>el()},window:{KaementoBoldConfig:variants,addEventListener:(k,f)=>events[k]=f,KaementoOrderCustomer:{open:async(s,prepare)=>prepare(customer)},BoldCheckout:class{constructor(c){this.config=c;}async open(){opens.push(this.config);}}},fetch:async(url,options)=>{
  requests.push(options);const input=JSON.parse(options.body),s=variants.normalizeBoquilla({productId:input.productId,items:input.items});
  return {ok:true,json:async()=>({orderId:'KAE-BOQUILLA-1800000000000-1234567890abcdef',amount:invalid?1:variants.kitCount(s)*44000,unitPrice:44000,currency:'COP',tax:'vat-19',apiKey:'fixture',integritySignature:'a'.repeat(64),statusToken:'b'.repeat(64),selection:s,description:'Boquilla Mágica'})};
 }};
 vm.runInNewContext(fs.readFileSync('boquilla-compra.js','utf8'),context);
 assert.equal(buy.disabled,true);add.handlers.click();assert.equal(buy.disabled,false);
 color.value='gris';quantity.value='21';add.handlers.click();assert.match(total.textContent,/1.012.000/);
 assert.equal(variants.kitCount(JSON.parse(saved.get('kaemento-boquilla-cart-v1'))),23);
 await buy.handlers.click();assert.equal(opens.length,0);assert.equal(session.size,0);
 invalid=false;await buy.handlers.click();assert.equal(opens.length,1);assert.equal(opens[0].amount,'1012000');
 assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
 assert.ok(session.has('kaemento-order-access'));assert.ok(!JSON.stringify([...saved,...session]).includes(customer.email));
 events.pagehide();events.pageshow();assert.match(total.textContent,/1.012.000/);
 const firstRow=list.children[0],remove=firstRow.children[1];remove.handlers.click();assert.match(total.textContent,/924.000/);
});
test('Boquilla payment return clears only a matching paid cart and renders the chosen colors',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 async function result(paymentStatus,draft=selection){
  const id='KAE-BOQUILLA-1800000000000-1234567890abcdef',key='kaemento-boquilla-cart-v1',store=new Map([[key,JSON.stringify(draft)]]),nodes=new Map(),measured=[];
  const node=()=>({textContent:'',hidden:false,children:[],addEventListener(){},setAttribute(){},removeAttribute(){},replaceChildren(){this.children=[];},append(n){this.children.push(n);}});
  const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  const document={getElementById:get,querySelector:get,createElement:node,addEventListener(){},hidden:true};
  vm.runInNewContext(fs.readFileSync('pagos/resultado.js','utf8'),{window:{KaementoBoldConfig:variants,addEventListener(){},kaementoMeasurePaidOrder:(...args)=>measured.push(args)},document,location:{search:'?bold-order-id='+id+'&bold-tx-status=approved'},localStorage:{getItem:k=>store.get(k),removeItem:k=>store.delete(k)},sessionStorage:{getItem:k=>k==='kaemento-order-access'?JSON.stringify({[id]:'a'.repeat(64)}):null},URLSearchParams,Intl,AbortSignal,clearTimeout(){},setTimeout(){},fetch:async()=>({ok:true,json:async()=>({orderId:id,selection,currency:'COP',amount:880000,paymentStatus})})});
  await new Promise(r=>setImmediate(r));return {store,nodes,measured};
 }
 for(const status of ['pending','failed','refunded']){const r=await result(status);assert.ok(r.store.size);assert.equal(r.measured.length,0);}
 const paid=await result('paid');assert.equal(paid.store.size,0);assert.equal(paid.measured.length,1);assert.match(paid.nodes.get('payment-items').children[0].textContent,/Boquilla Mágica.*Beige/);assert.match(paid.nodes.get('payment-back').href,/boquilla-magica/);
 const other=await result('paid',{productId:'boquilla-magica',items:[{color:'gris',quantity:1}]});assert.equal(other.store.size,1);
});
