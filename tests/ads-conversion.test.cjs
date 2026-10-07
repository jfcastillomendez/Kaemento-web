const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes,createHash,createHmac}=require('node:crypto');
const {createConversion}=require('../api/bold/conversion.js');
const {SEND_TO}=require('../api/bold/_lib/ads-conversion-store.cjs');
const payments=require('../api/bold/_lib/payments.cjs');
const {redisFixture}=require('./helpers/redis.cjs');
const {customer}=require('./helpers/orders.cjs');
const env={VERCEL_ENV:'production',BOLD_CONFIRMATION_ENABLED:'true',BOLD_SECRET_KEY:randomBytes(32).toString('hex'),
  KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'local-fixture-only',BOLD_STORAGE_NAMESPACE:'ads-unit'};
const selection={items:[{quantity:1,colorMode:'standard',color:'extra-blanco',sealer:'mate'},
  {quantity:2,colorMode:'standard',color:'arena',sealer:'brillante'}]};
async function invoke(handler,body,headers={},method='POST') {
  const out={headers:{}};
  await handler({method,headers:{'content-type':'application/json',host:'www.kaemento.com',origin:'https://www.kaemento.com',...headers},body},
    {setHeader(k,v){out.headers[k]=v;},set statusCode(v){out.status=v;},end(v){out.body=JSON.parse(v);}});
  return out;
}
test('Ads endpoint is production-only and fails closed without leaking configuration',async()=>{
  const body={action:'prepare',orderId:'KAE-MICRO-1800000000000-1234567890abcdef',token:randomBytes(32).toString('hex')};
  let reads=0;const factory=()=>{reads++;throw new Error('private storage details');};
  for(const VERCEL_ENV of [undefined,'preview','development']) {
    const out=await invoke(createConversion({...env,VERCEL_ENV},factory),body);assert.equal(out.body.status,'disabled');
  }
  assert.equal((await invoke(createConversion({...env,BOLD_CONFIRMATION_ENABLED:'false'},factory),body)).body.status,'disabled');
  assert.equal(reads,0);
  const handler=createConversion(env,factory);
  for(const edit of [{...body,value:1},{...body,paid:true},{...body,currency:'COP'},{...body,send_to:SEND_TO},{...body,token:['abc']},{...body,orderId:['bad']},{...body,action:'confirm'},null,[]]) {
    assert.equal((await invoke(handler,edit)).status,400);
  }
  assert.equal((await invoke(handler,body,{},'GET')).status,405);
  assert.equal((await invoke(handler,body,{'content-type':'text/plain'})).status,415);
  assert.equal((await invoke(handler,body,{origin:'https://attacker.example'})).status,403);
  assert.equal((await invoke(handler,'x'.repeat(321))).status,413);
  const fail=await invoke(handler,body);assert.equal(fail.status,503);assert.ok(!JSON.stringify(fail).includes('private'));
  assert.equal(fail.headers['Cache-Control'],'no-store');
});
test('Real Redis: only signed paid orders receive a single durable Ads authorization',{skip:!process.env.REDIS_SERVER_BIN},async t=>{
  const redis=await redisFixture();let now=Date.now();
  const store=()=>payments.createStore(env,redis.transport,()=>now),handler=()=>createConversion(env,store);
  const {handle}=await import('../api/bold/webhook.mjs');
  async function order() {
    const orderId=`KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`,token=randomBytes(32).toString('hex');
    const record={...payments.orderRecord(orderId,selection,customer),statusTokenHash:createHash('sha256').update(token).digest('hex'),statusAccessUntil:now+30*86400000};
    await store().saveOrder(record);return {record,orderId,token,action:'prepare'};
  }
  const prepare=o=>invoke(handler(),{action:'prepare',orderId:o.orderId,token:o.token});
  const consume=(o,ticket)=>invoke(handler(),{action:'consume',orderId:o.orderId,ticket});
  async function webhook(o,type='SALE_APPROVED',edit={},signature=true) {
    const raw=JSON.stringify({id:randomBytes(12).toString('hex'),type,data:{payment_id:'payment-'+o.orderId,metadata:{reference:o.orderId},amount:{currency:'COP',total:o.record.amount},...edit}});
    return handle(new Request('https://fixture.invalid/api/bold/webhook',{method:'POST',body:raw,headers:{'content-type':'application/json',
      'x-bold-signature':signature?createHmac('sha256',env.BOLD_SECRET_KEY).update(Buffer.from(raw).toString('base64')).digest('hex'):'0'.repeat(64)}}),env,store);
  }
  try {
    await t.test('Pending, rejected, refunded, bad signatures and amount/currency mismatches cannot convert',async()=>{
      const o=await order();assert.equal((await prepare(o)).body.status,'not_paid');
      assert.equal((await webhook(o,'SALE_APPROVED',{},false)).status,401);
      assert.equal((await webhook(o,'SALE_APPROVED',{amount:{currency:'COP',total:1}})).status,422);
      assert.equal((await webhook(o,'SALE_APPROVED',{amount:{currency:'USD',total:o.record.amount}})).status,422);
      assert.equal((await prepare(o)).body.status,'not_paid');
      await webhook(o,'SALE_REJECTED');assert.equal((await prepare(o)).body.status,'not_paid');
      await webhook(o);const p=await prepare(o);assert.equal(p.body.status,'prepared');
      await webhook(o,'VOID_APPROVED');assert.equal((await consume(o,p.body.ticket)).body.status,'not_paid');
      assert.equal((await prepare(o)).body.status,'not_paid');
    });
    await t.test('Concurrent tabs, reloads, cold instances and replayed webhooks yield exactly one real-total payload',async()=>{
      const o=await order();await webhook(o);
      const ordersBefore=await redis.command(['GET','kaemento:ads-unit:order:'+o.orderId]);
      const prepared=await Promise.all(Array.from({length:12},()=>prepare(o)));
      assert.equal(new Set(prepared.map(x=>x.body.ticket)).size,1);
      const ticket=prepared[0].body.ticket;
      const replies=await Promise.all(Array.from({length:24},()=>consume(o,ticket)));
      const accepted=replies.filter(x=>x.body.status==='authorized');assert.equal(accepted.length,1);
      assert.deepEqual(accepted[0].body.conversion,{send_to:'AW-18358591293/UeCLCJPZtpQdEL2-h7JE',value:1096500,currency:'COP',transaction_id:o.orderId});
      for(const value of [customer.email,customer.name,customer.document,customer.phone,customer.address,o.token,env.BOLD_SECRET_KEY]) assert.ok(!JSON.stringify(accepted).includes(value));
      await webhook(o);assert.equal((await prepare(o)).body.status,'already_issued');
      assert.equal((await consume(o,ticket)).body.conversion,undefined);
      assert.equal(await redis.command(['TTL','kaemento:ads-unit:ads-conversion:'+o.orderId]),-1);
      assert.deepEqual(JSON.parse(await redis.command(['GET','kaemento:ads-unit:order:'+o.orderId])),JSON.parse(ordersBefore));
      const receipt=JSON.parse(await redis.command(['GET','kaemento:ads-unit:ads-conversion:'+o.orderId]));
      assert.equal(receipt.status,'issued');assert.equal(receipt.ticket,undefined);
    });
    await t.test('Access proof, ticket scope, expiration and the private webhook outbox are required',async()=>{
      const o=await order(),other=await order();await webhook(o);await webhook(other);
      assert.equal((await prepare({...o,token:other.token})).status,404);
      const p=await prepare(o);assert.equal((await consume(other,p.body.ticket)).status,404);
      now+=300001;assert.equal((await consume(o,p.body.ticket)).status,404);
      const next=await prepare(o);assert.notEqual(next.body.ticket,p.body.ticket);
      await redis.command(['DEL','kaemento:ads-unit:purchase:'+o.orderId]);
      assert.equal((await consume(o,next.body.ticket)).body.status,'not_paid');
      now+=31*86400000;assert.equal((await prepare(other)).status,404);
    });
    await t.test('Persisted totals are used without multiplying by a hardcoded kit price',async()=>{
      const o=await order();o.record.amount=987654;await redis.command(['SET','kaemento:ads-unit:order:'+o.orderId,JSON.stringify(o.record)]);
      await webhook(o);const p=await prepare(o);assert.equal((await consume(o,p.body.ticket)).body.conversion.value,987654);
    });
  } finally {await redis.close();}
});
