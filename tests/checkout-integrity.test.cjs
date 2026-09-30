const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {createCheckout}=require('../api/bold/checkout.js');
const {createStatus}=require('../api/bold/status.js');
const payments=require('../api/bold/_lib/payments.cjs');
const {redisFixture}=require('./helpers/redis.cjs');
const {customer}=require('./helpers/orders.cjs');
const env={BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),BOLD_SECRET_KEY:randomBytes(32).toString('hex'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'audit-tests'};
const selection={productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',color:'extra-blanco',sealer:'mate'};
async function invoke(handler,body,headers={}) {
 const out={headers:{}};
 await handler({method:'POST',headers:{'content-type':'application/json',...headers},body},{setHeader(k,v){out.headers[k]=v;},set statusCode(v){out.status=v;},end(v){out.body=JSON.parse(v);}});
 return out;
}
test('Concurrent checkout retries create exactly one durable order and return the same signature/token',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try {
 const store=payments.createStore(env,redis.transport),handler=createCheckout(env,()=>store),key=randomUUID();
 const calls=await Promise.all(Array.from({length:16},()=>invoke(handler,{...selection,customer},{'idempotency-key':key})));
 assert.ok(calls.every(x=>x.status===200));assert.equal(new Set(calls.map(x=>x.body.orderId)).size,1);
 assert.equal(new Set(calls.map(x=>x.body.integritySignature)).size,1);assert.equal(new Set(calls.map(x=>x.body.statusToken)).size,1);
 const {orderId,statusToken}=calls[0].body,order=await store.readOrder(orderId);
 assert.equal(order.customerEmail,customer.email);assert.notEqual(order.statusTokenHash,statusToken);
 assert.equal((await invoke(handler,{...selection,quantity:2,customer},{'idempotency-key':key})).status,409);
 assert.equal((await invoke(handler,{...selection,customer},{'idempotency-key':'bad'})).status,400);
 assert.equal((await invoke(handler,{...selection,customer},{host:'site.example',origin:'https://attacker.example'})).status,403);
 const status=createStatus(env,()=>store),valid={orderId,token:statusToken};
 assert.equal((await invoke(status,valid)).body.paymentStatus,'pending');
 assert.equal((await invoke(status,{...valid,token:[statusToken]})).status,400);
 assert.equal((await invoke(status,{...valid,orderId:[orderId]})).status,400);
 assert.equal((await invoke(status,{...valid,token:randomBytes(32).toString('hex')})).status,404);
 assert.equal((await invoke(status,{...valid,orderId:orderId.slice(0,-1)+'f'})).status,orderId.endsWith('f')?200:404);
 assert.equal((await invoke(status,{...valid,customerEmail:customer.email})).status,400);
 assert.equal((await invoke(createStatus(env,()=>store,()=>Date.now()+31*86400000),valid)).status,404);
 const event={id:'test-approved',type:'SALE_APPROVED',paymentId:'test-payment',orderId,amount:365500,currency:'COP'};
 assert.equal(await store.process(event),'confirmed');
 const result=await invoke(status,valid);assert.equal(result.body.paymentStatus,'paid');assert.ok(result.body.paidAt);
 assert.deepEqual(Object.keys(result.body).sort(),['orderId','paymentStatus','selection','amount','currency','paidAt'].sort());
 for(const value of [customer.email,customer.name,customer.document,customer.phone,customer.address,statusToken,env.BOLD_SECRET_KEY])assert.ok(!JSON.stringify(result).includes(value));
 assert.equal((await invoke(handler,{...selection,customer},{'idempotency-key':key})).status,409);
 assert.equal(await store.process(event),'duplicate');
 assert.equal((await invoke(status,valid)).body.paymentStatus,'paid');
 }finally{await redis.close();}
});
test('Checkout rate limit blocks only new requests, preserves retries, and recovers after its window',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try {
 const store=payments.createStore(env,redis.transport),handler=createCheckout(env,()=>store),key=randomUUID();
 for(let i=0;i<12;i++)assert.equal((await invoke(handler,{...selection,customer},{'idempotency-key':i===0?key:randomUUID()})).status,200);
 const limited=await invoke(handler,{...selection,customer},{'idempotency-key':randomUUID()});assert.equal(limited.status,429);assert.equal(limited.body.integritySignature,undefined);
 assert.equal((await invoke(handler,{...selection,customer},{'idempotency-key':key})).status,200);
 assert.equal((await invoke(handler,{...selection,customer},{'x-vercel-forwarded-for':'192.0.2.10'})).status,200);
 const {createHmac}=require('node:crypto');
 const ipHash=createHmac('sha256',env.BOLD_SECRET_KEY).update('checkout-ip:local').digest('hex');
 const rateKey='kaemento:'+env.BOLD_STORAGE_NAMESPACE+':checkout-rate:'+ipHash;
 assert.ok(await redis.command(['TTL',rateKey])>3500);
 await redis.command(['EXPIRE',rateKey,0]);
 assert.equal((await invoke(handler,{...selection,customer},{'idempotency-key':randomUUID()})).status,200);
 }finally{await redis.close();}
});
test('Storage outage cannot be interpreted as confirmed payment',async()=>{
 const result=await invoke(createStatus(env,()=>({async readOrder(){throw new Error('offline');}})),{orderId:'KAE-MICRO-1234567890123-0123456789abcdef',token:'a'.repeat(64)});
 assert.equal(result.status,503);assert.equal(result.body.paymentStatus,undefined);
});
test('Scheduled email retries use a separate credential and cannot be invoked publicly',async()=>{
 const {handle}=await import('../api/bold/retry-emails.mjs');const cronSecret=randomBytes(32).toString('hex');
 const request=auth=>new Request('https://example.invalid/api/bold/retry-emails',{headers:{authorization:auth}});
 const e={...env,CRON_SECRET:cronSecret,KAEMENTO_EMAIL_RETRY_SECRET:randomBytes(32).toString('hex')};
 const store=()=>({async dueEmails(){return [];}});
 assert.equal((await handle(request(''),e,store)).status,401);
 assert.equal((await handle(request('Bearer '+e.KAEMENTO_EMAIL_RETRY_SECRET),e,store)).status,401);
 assert.equal((await handle(request('Bearer '+cronSecret),env,store)).status,503);
 const result=await handle(request('Bearer '+cronSecret),e,store);assert.equal(result.status,200);assert.equal((await result.json()).status,'nothing_due');
});
