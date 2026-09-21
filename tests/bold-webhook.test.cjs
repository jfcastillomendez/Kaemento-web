const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createHmac,randomBytes} = require('node:crypto');
const payments = require('../api/bold/_lib/payments.cjs');
const {customer} = require('./helpers/orders.cjs');
const secret = randomBytes(32).toString('hex');
const env = {BOLD_CONFIRMATION_ENABLED:'true',BOLD_SECRET_KEY:secret,
  UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'unit'};
const selection = {quantity:2,colorMode:'mix',color1:'arena',color2:'negro',percentage1:70,percentage2:30,sealer:'brillante'};
const orderId = () => `KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`;
function event(reference=orderId(),change={}) {
  return {id:randomBytes(16).toString('hex'),type:'SALE_APPROVED',data:{payment_id:randomBytes(12).toString('hex'),
    metadata:{reference},amount:{currency:'COP',total:731000},payer_email:'PRIVATE@example.invalid',card:{cardholder_name:'PRIVATE PERSON'}},...change};
}
function request(body,headers={}) {
  const raw = typeof body==='string'?body:JSON.stringify(body);
  return new Request('https://preview.example/api/bold/webhook',{method:'POST',body:raw,headers:{'content-type':'application/json',
    'x-bold-signature':createHmac('sha256',secret).update(Buffer.from(raw).toString('base64')).digest('hex'),...headers}});
}
let handle;
before(async()=>{({handle}=await import('../api/bold/webhook.mjs'));});
test('Official Bold HMAC covers exact raw bytes encoded as base64',async()=>{
  const data=event(),raw=JSON.stringify(data,null,2)+'\n'; let calls=0;
  const store=()=>({async process(n){calls++;assert.deepEqual(n,payments.notification(data));return 'confirmed';}});
  assert.equal((await handle(request(raw),env,store)).status,200);
  const signature=createHmac('sha256',secret).update(Buffer.from(raw).toString('base64')).digest('hex');
  assert.equal((await handle(request(JSON.stringify(data),{'x-bold-signature':signature}),env,store)).status,401);
  assert.equal((await handle(request(raw,{'x-bold-signature':createHmac('sha256',secret).update(raw).digest('hex')}),env,store)).status,401);
  for(const signature of ['', 'z'.repeat(64),'abc'])assert.equal((await handle(request(raw,{'x-bold-signature':signature}),env,store)).status,401);
  assert.equal(calls,1);
});
test('Only authenticated valid states/amounts/references reach storage; private fields are discarded',async()=>{
  let calls=0;const store=()=>({async process(n){calls++;assert.ok(!JSON.stringify(n).includes('PRIVATE'));return 'recorded';}});
  for(const type of ['SALE_APPROVED','SALE_REJECTED','VOID_APPROVED','VOID_REJECTED'])assert.equal((await handle(request(event(undefined,{type})),env,store)).status,200);
  for(const edit of [x=>x.type='APPROVED',x=>x.data.amount.currency='USD',x=>x.data.amount.total='731000',x=>x.data.amount.total=0,x=>x.data.metadata.reference='unknown',x=>x.data.payment_id='<script>']){
    const x=event();edit(x);assert.equal((await handle(request(x),env,store)).status,422);
  }
  assert.equal(calls,4);
  assert.equal((await handle(request('not json'),env,store)).status,400);
  assert.equal((await handle(request('x'.repeat(65537)),env,store)).status,413);
  assert.equal((await handle(request(event(),{'content-type':'text/plain'}),env,store)).status,415);
  assert.equal((await handle(new Request('https://preview.example/api/bold/webhook'),env,store)).status,405);
});
test('Disabled, unconfigured or unavailable persistence never acknowledges a confirmation',async()=>{
  assert.equal((await handle(request(event()),{...env,BOLD_CONFIRMATION_ENABLED:'false'})).status,503);
  assert.equal((await handle(request(event()),{...env,UPSTASH_REDIS_REST_TOKEN:''})).status,503);
  const result=await handle(request(event()),env,()=>({async process(){throw new Error(secret);}}));
  assert.equal(result.status,503);assert.ok(!(await result.text()).includes(secret));
});
test('purchase projection is available only for verified approved orders and contains no webhook PII',()=>{
  const order=payments.orderRecord(orderId(),selection,customer);
  assert.equal(payments.purchaseEvent(order),null);
  const purchase=payments.purchaseEvent({...order,status:'approved',paymentId:'valid-payment',payer_email:'PRIVATE',card:{name:'PRIVATE'}});
  assert.equal(purchase.name,'purchase');assert.equal(purchase.params.value,731000);
  assert.equal(purchase.params.items[0].item_variant,'arena:70+negro:30');assert.equal(purchase.params.items[0].sealer_type,'brillante');
  assert.ok(!JSON.stringify(purchase).includes('PRIVATE'));
  for(const status of ['pending','rejected','voided'])assert.equal(payments.purchaseEvent({...order,status,paymentId:'valid-payment'}),null);
});

// Optional genuine Redis integration tests. REDIS_SERVER_BIN points to an ephemeral local Redis installation.
// They exercise the production Lua through two store instances, not a JS reimplementation of its rules.
const redisBin=process.env.REDIS_SERVER_BIN;
test('Durable atomic confirmation with real Redis', {skip:!redisBin}, async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
 const {spawn}=require('node:child_process');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kaemento-webhook-')),socket=path.join(dir,'redis.sock');
 const processRedis=spawn(redisBin,['--port','0','--unixsocket',socket,'--save','','--appendonly','no','--dir',dir],{stdio:'ignore'});
 let startError;processRedis.on('error',e=>{startError=e;});
 try{
  for(let i=0;i<200&&!fs.existsSync(socket)&&!startError;i++)await new Promise(r=>setTimeout(r,20));
  if(startError)throw startError;assert.ok(fs.existsSync(socket),'Redis starts');
  function redis(args){return new Promise((resolve,reject)=>{
    const s=net.createConnection(socket);let data=Buffer.alloc(0);
    s.on('error',reject);s.on('connect',()=>s.write('*'+args.length+'\r\n'+args.map(x=>{const v=String(x);return '$'+Buffer.byteLength(v)+'\r\n'+v+'\r\n';}).join('')));
    s.on('data',chunk=>{data=Buffer.concat([data,chunk]);const end=data.indexOf('\r\n');if(end<0)return;
      const type=String.fromCharCode(data[0]),first=data.subarray(1,end).toString();
      if(type==='$'&&Number(first)>=0&&data.length<end+2+Number(first)+2)return;
      s.destroy();if(type==='-')return reject(new Error(first));
      resolve(type===':'?Number(first):type==='$'?(Number(first)<0?null:data.subarray(end+2,end+2+Number(first)).toString()):first);
    });
  });}
  const transmitted=[];
  const transport=async(url,options)=>{const args=JSON.parse(options.body);transmitted.push(args);return Response.json({result:await redis(args)});};
  const a=payments.createStore(env,transport),b=payments.createStore(env,transport),prefix='kaemento:unit:';
  await t.test('Concurrent duplicate deliveries, fresh event IDs and a cold instance create one purchase',async()=>{
    const record=payments.orderRecord(orderId(),selection,customer);await a.saveOrder(record);
    const payload=event(record.orderId),notice=payments.notification(payload);
    const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?a:b).process(notice)));
    assert.equal(results.filter(x=>x==='confirmed').length,1);assert.equal(results.filter(x=>x==='duplicate').length,19);
    assert.equal(await b.process({...notice,id:randomBytes(16).toString('hex')}),'duplicate_payment');
    assert.equal(await redis(['SCARD',prefix+'campaign:confirmed-orders']),1);
    const saved=await b.readOrder(record.orderId);assert.equal(saved.status,'approved');assert.deepEqual(saved.selection,selection);
    const purchase=JSON.parse(await redis(['GET',prefix+'purchase:'+record.orderId]));
    assert.equal(purchase.analyticsStatus,'awaiting_configuration');assert.ok(payments.purchaseEvent(purchase));
    assert.ok(!JSON.stringify(transmitted).includes('PRIVATE'));
    assert.equal(await b.process({...notice,id:randomBytes(16).toString('hex'),type:'SALE_REJECTED'}),'recorded');
    assert.equal((await a.readOrder(record.orderId)).status,'approved','late rejection cannot downgrade approval');
    assert.equal(await b.process({...notice,id:randomBytes(16).toString('hex'),type:'VOID_APPROVED'}),'recorded');
    assert.equal(await redis(['SCARD',prefix+'campaign:confirmed-orders']),0);
    assert.equal(payments.purchaseEvent(JSON.parse(await redis(['GET',prefix+'purchase:'+record.orderId]))),null);
  });
  await t.test('Wrong amount/order/payment and event collisions cannot count another purchase',async()=>{
    const r1=payments.orderRecord(orderId(),selection,customer),r2=payments.orderRecord(orderId(),selection,customer);await a.saveOrder(r1);await a.saveOrder(r2);
    const n=payments.notification(event(r1.orderId));
    assert.equal(await a.process({...n,amount:1}),'mismatch');
    assert.equal(await a.process({...n,orderId:orderId()}),'unknown_order');
    assert.equal(await a.process(n),'confirmed');
    assert.equal(await a.process({...n,orderId:r2.orderId,id:randomBytes(16).toString('hex')}),'payment_conflict');
    assert.equal(await a.process({...n,paymentId:'other-payment'}),'event_conflict');
    assert.equal(await a.process({...n,paymentId:'other-payment',id:randomBytes(16).toString('hex')}),'order_conflict');
    assert.equal((await b.readOrder(r2.orderId)).status,'pending');
  });
  await t.test('Void before approval never creates a confirmed purchase',async()=>{
    const record=payments.orderRecord(orderId(),selection,customer);await a.saveOrder(record);
    const n=payments.notification(event(record.orderId));
    await a.process({...n,type:'VOID_APPROVED'});
    assert.equal(await a.process({...n,id:randomBytes(16).toString('hex')}),'ignored_voided');
    assert.equal(await redis(['GET',prefix+'purchase:'+record.orderId]),null);
  });
  await t.test('Checkout persists before returning its signature and fails closed on storage failure',async()=>{
    const checkout=require('../api/bold/checkout.js'),oldFetch=global.fetch,oldEnv={...process.env};
    Object.assign(process.env,env,{BOLD_IDENTITY_KEY:randomBytes(16).toString('hex')});global.fetch=transport;
    async function invoke(){const out={};await checkout({method:'POST',headers:{'content-type':'application/json'},body:{productId:'microcemento-kaemento-launch',...selection,customer}},
      {setHeader(){},set statusCode(x){out.status=x;},end(x){out.body=JSON.parse(x);}});return out;}
    try{
      const out=await invoke();assert.equal(out.status,200);assert.equal((await a.readOrder(out.body.orderId)).amount,731000);
      assert.ok(out.body.integritySignature);assert.ok(!JSON.stringify(out).includes(secret));
      global.fetch=async()=>{throw new Error('offline');};const fail=await invoke();assert.equal(fail.status,503);assert.equal(fail.body.integritySignature,undefined);
    }finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in oldEnv))delete process.env[key];Object.assign(process.env,oldEnv);}
  });
 }finally{if(processRedis.exitCode === null && processRedis.signalCode === null){const stopped=new Promise(r=>processRedis.once('exit',r));processRedis.kill('SIGTERM');await stopped;}fs.rmSync(dir,{recursive:true,force:true});}
});
