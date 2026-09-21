const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes} = require('node:crypto');
const {createStore, orderRecord} = require('../api/bold/_lib/payments.cjs');
const {createCheckout} = require('../api/bold/checkout.js');
const {redisFixture} = require('./helpers/redis.cjs');
const {customer} = require('./helpers/orders.cjs');

// Synthetic fixtures only; never read environment credentials or contact Upstash.
const legacy = {UPSTASH_REDIS_REST_URL:'https://legacy-fixture.upstash.io',
  UPSTASH_REDIS_REST_TOKEN:randomBytes(16).toString('hex')};
const kv = {KV_REST_API_URL:'https://vercel-fixture.upstash.io',
  KV_REST_API_TOKEN:randomBytes(16).toString('hex')};
const selection = {quantity:1,colorMode:'standard',color:'arena',sealer:'mate'};
function record() {
  return orderRecord(`KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`,selection,customer);
}

for (const [name, config, expectedUrl, expectedToken] of [
  ['legacy names',legacy,legacy.UPSTASH_REDIS_REST_URL,legacy.UPSTASH_REDIS_REST_TOKEN],
  ['Vercel KV names',kv,kv.KV_REST_API_URL,kv.KV_REST_API_TOKEN],
  ['legacy precedence',{...kv,...legacy},legacy.UPSTASH_REDIS_REST_URL,legacy.UPSTASH_REDIS_REST_TOKEN],
  ['independent URL fallback',{...kv,UPSTASH_REDIS_REST_TOKEN:legacy.UPSTASH_REDIS_REST_TOKEN},kv.KV_REST_API_URL,legacy.UPSTASH_REDIS_REST_TOKEN],
  ['independent token fallback',{...kv,UPSTASH_REDIS_REST_URL:legacy.UPSTASH_REDIS_REST_URL},legacy.UPSTASH_REDIS_REST_URL,kv.KV_REST_API_TOKEN],
  ['empty legacy values',{...kv,UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:''},kv.KV_REST_API_URL,kv.KV_REST_API_TOKEN]
]) test(`Storage compatibility: ${name}`, async()=>{
  const order = record(); let calls = 0;
  const store = createStore({...config,BOLD_STORAGE_NAMESPACE:'preview-pedidos'},async(url,options)=>{
    calls++;
    assert.ok(url === expectedUrl, 'uses the expected REST endpoint');
    assert.ok(options.headers.Authorization === `Bearer ${expectedToken}`, 'uses the expected write token');
    assert.deepEqual(JSON.parse(options.body),['SET',`kaemento:preview-pedidos:order:${order.orderId}`,JSON.stringify(order),'NX']);
    return Response.json({result:'OK'});
  });
  await store.saveOrder(order); assert.equal(calls,1);
});

test('Missing or invalid namespace fails before transport, for either naming convention',()=>{
  let calls = 0;
  for (const config of [legacy,kv]) for (const namespace of [undefined,'',' ','INVALID','../shared','a'.repeat(65)]) {
    assert.throws(()=>createStore({...config,BOLD_STORAGE_NAMESPACE:namespace},async()=>{calls++;}),
      {message:'Payment storage unavailable'});
  }
  assert.equal(calls,0);
});

test('Read-only tokens and non-REST URLs never substitute for write credentials',()=>{
  const unsupported = {KV_REST_API_READ_ONLY_TOKEN:randomBytes(16).toString('hex'),
    KV_URL:'redis://fixture.invalid',REDIS_URL:'redis://fixture.invalid'};
  for (const config of [unsupported,{...unsupported,KV_REST_API_URL:kv.KV_REST_API_URL},
    {...unsupported,KV_REST_API_TOKEN:kv.KV_REST_API_TOKEN},
    {...kv,UPSTASH_REDIS_REST_URL:'http://fixture.invalid'},
    {...kv,UPSTASH_REDIS_REST_TOKEN:' '}]) {
    assert.throws(()=>createStore({...config,BOLD_STORAGE_NAMESPACE:'preview-pedidos'}),
      {message:'Payment storage unavailable'});
  }
});

test('Checkout without namespace returns 503 without storing or issuing a signature',async()=>{
  for (const config of [legacy,kv]) {
    let calls = 0; const result = {};
    const env = {...config,BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),
      BOLD_SECRET_KEY:randomBytes(32).toString('hex')};
    await createCheckout(env,e=>createStore(e,async()=>{calls++;}))({method:'POST',
      headers:{'content-type':'application/json'},body:{productId:'microcemento-kaemento-launch',...selection,customer}},
    {setHeader(){},set statusCode(value){result.status=value;},end(value){result.body=JSON.parse(value);}});
    assert.equal(result.status,503); assert.equal(calls,0);
    assert.deepEqual(result.body,{error:'No pudimos guardar tu pedido. Intenta nuevamente.'});
  }
});

test('KV persistence survives a fresh adapter and isolates Preview from Production namespaces',
  {skip:!process.env.REDIS_SERVER_BIN},async()=>{
    const redis = await redisFixture();
    try {
      const previewEnv = {...kv,BOLD_STORAGE_NAMESPACE:'preview-pedidos'};
      const preview = createStore(previewEnv,redis.transport);
      // Both namespaces are exercised only in this ephemeral local test Redis.
      const production = createStore({...kv,BOLD_STORAGE_NAMESPACE:'production-pedidos'},redis.transport);
      const order = record(); await preview.saveOrder(order);
      assert.deepEqual(await createStore(previewEnv,redis.transport).readOrder(order.orderId),order);
      assert.equal(await production.readOrder(order.orderId),null);
      const other = {...order,selection:{...selection,sealer:'brillante'}};
      await production.saveOrder(other);
      assert.deepEqual(await production.readOrder(order.orderId),other);
      assert.deepEqual(await createStore({...legacy,BOLD_STORAGE_NAMESPACE:'preview-pedidos'},redis.transport).readOrder(order.orderId),order);
    } finally { await redis.close(); }
  });
