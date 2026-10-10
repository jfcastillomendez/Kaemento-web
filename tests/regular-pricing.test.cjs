const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,randomUUID,createHash,createHmac}=require('node:crypto');
const {createCheckout}=require('../api/bold/checkout.js');
const {createConversion}=require('../api/bold/conversion.js');
const {emailContent}=require('../api/bold/_lib/order-emails.cjs');
const payments=require('../api/bold/_lib/payments.cjs');
const {redisFixture}=require('./helpers/redis.cjs'),{customer}=require('./helpers/orders.cjs');
const {estimate}=require('../kit-estimate.js');
async function invoke(handler,body,key=randomUUID()) {
 const out={};await handler({method:'POST',headers:{'content-type':'application/json','idempotency-key':key},body},
 {setHeader(){},set statusCode(v){out.status=v;},end(v){out.body=JSON.parse(v);}});return out;
}
test('Coverage helper rounds up both ends of the documented range without inventing exact coverage',()=>{
 assert.deepEqual(estimate(26),{min:3,max:3});assert.deepEqual(estimate(24),{min:2,max:3});
 assert.deepEqual(estimate(10),{min:1,max:1});assert.deepEqual(estimate(10.1),{min:1,max:2});
 for(const area of [0,-1,NaN,Infinity,'26',100001])assert.equal(estimate(area),null);
});
test('Regular-price multi-color order keeps its true total through signed payment, email jobs and single Ads authorization',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try {
 const env={VERCEL_ENV:'production',BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),BOLD_SECRET_KEY:randomBytes(32).toString('hex'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'test-only',BOLD_STORAGE_NAMESPACE:'regular-price-test'};
 const store=payments.createStore(env,redis.transport),checkout=createCheckout(env,()=>store),ads=createConversion(env,()=>store);
 const prefix='kaemento:'+env.BOLD_STORAGE_NAMESPACE+':';
 await redis.command(['SADD',prefix+'campaign:confirmed-orders',...Array.from({length:23},(_,i)=>'paid-fixture-'+i)]);
 const body={items:[{productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',color:'extra-blanco',sealer:'mate',surface:'walls'},
 {productId:'microcemento-kaemento-launch',quantity:2,colorMode:'mix',color1:'arena',color2:'gris-cemento',percentage1:70,percentage2:30,sealer:'brillante',surface:'floor'}],customer};
 for(const expectedUnitPrice of [1,0,430001,'430000',null])assert.equal((await invoke(checkout,{...body,expectedUnitPrice})).status,400);
 const stale=await invoke(checkout,body);assert.equal(stale.status,409);assert.equal(stale.body.code,'PRICE_CHANGED');assert.equal(stale.body.unitPrice,430000);
 assert.equal(await redis.command(['EVAL',"return #redis.call('KEYS', ARGV[1])",'0',prefix+'order:*']),0);
 const key=randomUUID();const accepted=await invoke(checkout,{...body,expectedUnitPrice:430000},key);
 assert.equal(accepted.status,200);const {orderId,amount,statusToken,integritySignature}=accepted.body;
 assert.equal(amount,1290000);assert.equal(integritySignature,createHash('sha256').update(`${orderId}${amount}COP${env.BOLD_SECRET_KEY}`).digest('hex'));
 const order=await store.readOrder(orderId);assert.equal(order.total,1290000);assert.equal(order.unitPrice,430000);assert.equal(order.campaign,null);
 assert.deepEqual(order.items.map(x=>x.subtotal),[430000,860000]);assert.equal(order.paymentStatus,'pending');
 const access={action:'prepare',orderId,token:statusToken};assert.equal((await invoke(ads,access)).body.status,'not_paid');
 const {handle}=await import('../api/bold/webhook.mjs');
 async function webhook(total=amount,valid=true) {
  const raw=JSON.stringify({id:'regular-payment-event',type:'SALE_APPROVED',data:{payment_id:'regular-payment-id',metadata:{reference:orderId},amount:{currency:'COP',total}}});
  const signature=valid?createHmac('sha256',env.BOLD_SECRET_KEY).update(Buffer.from(raw).toString('base64')).digest('hex'):'0'.repeat(64);
  return handle(new Request('https://fixture.upstash.io/api/bold/webhook',{method:'POST',body:raw,headers:{'content-type':'application/json','x-bold-signature':signature}}),env,()=>store);
 }
 assert.equal((await webhook(amount,false)).status,401);assert.equal((await webhook(1096500)).status,422);
 assert.equal((await store.readOrder(orderId)).paymentStatus,'pending');assert.equal((await webhook()).status,200);assert.equal((await webhook()).status,200);
 const paid=await store.readOrder(orderId);assert.equal(paid.paymentStatus,'paid');assert.equal(paid.invoiceStatus,'pending');assert.equal(paid.invoiceNumber,null);assert.equal(paid.cufe,null);
 assert.equal(await store.confirmedCampaignOrders(),23); // Regular sales do not consume promotion slots.
 for(const role of ['sales','customer']) {const text=emailContent(paid,role).text;assert.match(text,/1\.290\.000/);assert.match(text,/430\.000/);assert.match(text,/Aplicación: Muros/);assert.match(text,/Aplicación: Piso/);}
 assert.equal(await redis.command(['EVAL',"return #redis.call('KEYS', ARGV[1])",'0',prefix+'email:KAE*']),2);
 const prepared=await invoke(ads,access);assert.equal(prepared.body.status,'prepared');
 const consume={action:'consume',orderId,ticket:prepared.body.ticket};
 const results=await Promise.all(Array.from({length:8},()=>invoke(ads,consume)));
 const authorized=results.filter(x=>x.body.status==='authorized');assert.equal(authorized.length,1);
 assert.equal(authorized[0].body.conversion.value,1290000);assert.equal(authorized[0].body.conversion.transaction_id,orderId);
 assert.equal((await invoke(checkout,{...body,expectedUnitPrice:430000},key)).status,409);
 }finally{await redis.close();}
});

test('Floor and walls remain distinct even with identical tone and sealer, with legacy compatibility',()=>{
 const variants=require('../bold-config.js');
 const base={productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',color:'arena',sealer:'mate'};
 const selected=variants.normalizeCart({items:[{...base,surface:'floor'},{...base,surface:'walls'},{...base,surface:'floor'}]});
 assert.equal(selected.items.length,2);assert.equal(selected.items[0].quantity,2);assert.equal(selected.items[1].quantity,1);
 assert.equal(variants.normalize({...base,surface:'arbitrary'}),null);
 assert.deepEqual(variants.normalize(base),{quantity:1,colorMode:'standard',color:'arena',sealer:'mate'});
});
