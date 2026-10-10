const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {createCheckout}=require('../api/bold/checkout.js');
const {createPromotion}=require('../api/bold/promotion.js');
const campaign=require('../microcemento-launch-config.js');
const payments=require('../api/bold/_lib/payments.cjs');
const {redisFixture}=require('./helpers/redis.cjs'),{customer}=require('./helpers/orders.cjs');
const env={BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),BOLD_SECRET_KEY:randomBytes(32).toString('hex'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'campaign-window-tests'};
async function request(handler,method='GET',id=randomUUID(),expectedUnitPrice=365500) {
 const out={};await handler({method,headers:{'content-type':'application/json','idempotency-key':id},body:{productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',color:'arena',sealer:'mate',customer,expectedUnitPrice}},
 {setHeader(){},set statusCode(v){out.status=v;},end(v){out.body=JSON.parse(v);}});return out;
}
test('Campaign extension adds 30 days to the original deadline without resetting its start or quota',()=>{
 assert.equal(Date.parse(campaign.endsAt)-Date.parse('2026-10-19T00:29:14Z'),30*86400000);
 assert.equal(Date.parse(campaign.endsAt)-Date.parse(campaign.startsAt),60*86400000);
 assert.equal(campaign.historicalOrders,7);assert.equal(campaign.maxOrders,30);
 assert.equal(campaign.startsAt,'2026-09-19T00:29:14Z');assert.equal(campaign.launchPrice,365500);
});
test('Date or quota changes require review of the regular price; persisted retries retain their signed total',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try {
 let now=Date.parse(campaign.startsAt)-1;
 const store=payments.createStore(env,redis.transport,()=>now),checkout=createCheckout(env,()=>store),promotion=createPromotion(env,()=>store,()=>now);
 assert.equal((await request(promotion)).body.state,'upcoming');
 const before=await request(checkout,'POST');assert.equal(before.status,409);assert.equal(before.body.code,'PRICE_CHANGED');assert.equal(before.body.unitPrice,430000);assert.equal(before.body.integritySignature,undefined);
 now++;const key=randomUUID(),opened=await request(checkout,'POST',key);assert.equal(opened.status,200);
 now=Date.parse('2026-10-19T00:29:14Z');assert.equal((await request(checkout,'POST')).body.amount,365500);
 now=Date.parse(campaign.endsAt)-1;assert.equal((await request(checkout,'POST')).status,200);assert.equal((await request(promotion)).body.state,'active');
 now++;const ended=await request(checkout,'POST');assert.equal(ended.status,409);assert.equal(ended.body.integritySignature,undefined);assert.equal((await request(promotion)).body.state,'ended');
 const regular=await request(checkout,'POST',randomUUID(),430000);assert.equal(regular.status,200);assert.equal(regular.body.amount,430000);
 const retry=await request(checkout,'POST',key);assert.equal(retry.status,200);assert.equal(retry.body.orderId,opened.body.orderId);assert.equal(retry.body.amount,365500);
 assert.equal(retry.body.integritySignature,opened.body.integritySignature);
 now=Date.parse(campaign.startsAt)+1000;
 await redis.command(['SADD','kaemento:'+env.BOLD_STORAGE_NAMESPACE+':campaign:confirmed-orders',...Array.from({length:22},(_,i)=>'paid-fixture-'+i)]);
 assert.equal((await request(promotion)).body.remaining,1);assert.equal((await request(promotion)).body.state,'active');
 assert.equal((await request(checkout,'POST')).status,200); // Seven external + 22 online paid orders leave one slot.
 await redis.command(['SADD','kaemento:'+env.BOLD_STORAGE_NAMESPACE+':campaign:confirmed-orders','paid-fixture-22']);
 assert.equal((await request(promotion)).body.state,'sold_out');assert.equal((await request(promotion)).body.remaining,0);
 const concurrent=await Promise.all(Array.from({length:8},()=>request(checkout,'POST')));
 assert.ok(concurrent.every(x=>x.status===409&&x.body.code==='PRICE_CHANGED'&&!x.body.integritySignature));
 assert.equal((await request(checkout,'POST',randomUUID(),430000)).body.amount,430000);
 assert.equal((await request(checkout,'POST',key)).status,200);
 }finally{await redis.close();}
});
