const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {createPromotion}=require('../api/bold/promotion.js');
const payments=require('../api/bold/_lib/payments.cjs');
const {redisFixture}=require('./helpers/redis.cjs');
const {customer}=require('./helpers/orders.cjs');
const env={BOLD_CONFIRMATION_ENABLED:'true',KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:randomBytes(20).toString('hex'),BOLD_STORAGE_NAMESPACE:'launch-count-tests'};
async function invoke(handler,method='GET') {
 const result={headers:{}};
 await handler({method},{setHeader(k,v){result.headers[k]=v;},set statusCode(v){result.status=v;},end(v){result.body=JSON.parse(v);}});
 return result;
}
test('Launch quota includes four historical orders and one slot per genuinely approved order, not per kit',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try {
  const store=payments.createStore(env,redis.transport),handler=createPromotion(env,()=>store,()=>Date.parse('2026-09-30T12:00:00Z'));
  const events=[];
  async function order(quantity=1) {
   const id=`KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`;
   await store.saveOrder(payments.orderRecord(id,{productId:'microcemento-kaemento-launch',quantity,colorMode:'standard',color:'extra-blanco',sealer:'mate'},customer));
   const event={id:randomBytes(16).toString('hex'),paymentId:randomBytes(12).toString('hex'),type:'SALE_APPROVED',orderId:id,amount:quantity*365500,currency:'COP'};
   events.push(event);return event;
  }
  const first=await order(3),second=await order();
  assert.equal((await invoke(handler)).body.remaining,26); // Pending carts do not consume quota.
  await store.process(first);await store.process(second);
  const baseline=await invoke(handler);assert.equal(baseline.status,200);assert.deepEqual(baseline.body,{capacity:30,remaining:24,state:'active',endsAt:'2026-10-19T00:29:14Z'});
  const next=await order(2);await Promise.all(Array.from({length:12},()=>store.process(next)));
  assert.equal((await invoke(handler)).body.remaining,23);
  await store.process({...next,id:randomBytes(16).toString('hex')});
  assert.equal((await invoke(handler)).body.remaining,23);
  const failed=await order();await store.process({...failed,type:'SALE_REJECTED'});
  assert.equal((await invoke(handler)).body.remaining,23);
  await store.process({...next,id:randomBytes(16).toString('hex'),type:'VOID_APPROVED'});
  assert.equal((await invoke(handler)).body.remaining,24);
  for(let i=0;i<26;i++)await store.process(await order());
  assert.equal((await invoke(handler)).body.remaining,0);
  assert.deepEqual(Object.keys(baseline.body).sort(),['capacity','endsAt','remaining','state']);
  assert.ok(!JSON.stringify(baseline).includes(customer.email));
  const preview=payments.createStore({...env,BOLD_STORAGE_NAMESPACE:'separate-preview'},redis.transport);
  assert.equal(await preview.confirmedCampaignOrders(),0);
 }finally{await redis.close();}
});
test('Unavailable or malformed quota never becomes a false availability number',async()=>{
 for(const value of [-1,1.5,'2',null,Number.NaN]) {
  const r=await invoke(createPromotion(env,()=>({async confirmedCampaignOrders(){return value;}})));
  assert.equal(r.status,503);assert.equal(r.body.remaining,undefined);assert.equal(r.headers['Cache-Control'],'no-store');
 }
 const missing=await invoke(createPromotion({},()=>{throw new Error('must not access storage');}));assert.equal(missing.status,503);
 const outage=await invoke(createPromotion(env,()=>({async confirmedCampaignOrders(){throw new Error('offline');}})));assert.equal(outage.status,503);
 assert.equal((await invoke(createPromotion(env),'POST')).status,405);
});
