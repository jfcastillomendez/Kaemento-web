const {test} = require('node:test');
const assert = require('node:assert/strict');
const {randomBytes,createHmac} = require('node:crypto');
const orders = require('../api/bold/_lib/orders.cjs');
const payments = require('../api/bold/_lib/payments.cjs');
const emails = require('../api/bold/_lib/order-emails.cjs');
const {createCheckout} = require('../api/bold/checkout.js');
const {invoiceProvider} = require('../api/bold/_lib/invoice-provider.cjs');
const {customer,checkoutStore} = require('./helpers/orders.cjs');
const {redisFixture} = require('./helpers/redis.cjs');
const env = {BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),BOLD_SECRET_KEY:randomBytes(32).toString('hex'),
  UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'orders-tests',
  KAEMENTO_EMAIL_ENABLED:'true',RESEND_API_KEY:randomBytes(32).toString('hex'),KAEMENTO_EMAIL_FROM:'KAEMENTO <pedidos@example.invalid>',
  KAEMENTO_SALES_EMAIL:'ventas@example.invalid,admin@example.invalid',KAEMENTO_EMAIL_RETRY_SECRET:randomBytes(32).toString('hex')};
const standard = {quantity:1,colorMode:'standard',color:'arena',sealer:'mate'};
const mixed = {quantity:3,colorMode:'mix',color1:'arena',color2:'gris-cemento',percentage1:40,percentage2:60,sealer:'brillante'};
const id = () => `KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`;
const notice = order => ({id:randomBytes(16).toString('hex'),type:'SALE_APPROVED',orderId:order.orderId,
  paymentId:randomBytes(12).toString('hex'),amount:order.amount,currency:'COP',paymentMethod:'PSE'});
async function invoke(body, factory=()=>({async saveOrder(){}}), configuration=env) {
  const out={}; await createCheckout(configuration,()=>checkoutStore(factory()))({method:'POST',headers:{'content-type':'application/json'},body},
    {setHeader(){},set statusCode(x){out.status=x;},end(x){out.body=JSON.parse(x);}}); return out;
}
test('Complete operational model, server totals and normalized buyer fields',async()=>{
  for(const selection of [standard,mixed,...[2,20].map(quantity=>({...standard,quantity}))]) {
    let persisted;
    const result = await invoke({productId:'microcemento-kaemento-launch',...selection,customer:{...customer,name:'  Cliente   Prueba  ',email:'CLIENTE@EXAMPLE.INVALID',document:'1.234.567.890',phone:'+57 (300) 123-4567'}},
      ()=>({async saveOrder(record){persisted=record;}}));
    assert.equal(result.status,200); assert.equal(persisted.total,365500*selection.quantity);
    assert.equal(persisted.subtotal,persisted.total); assert.equal(persisted.customerDocument,'1234567890');
    assert.equal(persisted.customerName,'Cliente Prueba');assert.equal(persisted.customerEmail,'cliente@example.invalid');
    assert.equal(persisted.customerPhone,'+573001234567');assert.equal(persisted.shippingAddress,customer.address);
    for(const [key,value] of Object.entries({productName:'Microcemento KAEMENTO',orderStatus:'created',paymentStatus:'pending',fulfillmentStatus:'pending',invoiceStatus:'pending',source:'kaemento-web'}))assert.equal(persisted[key],value);
    for(const key of ['invoiceNumber','cufe','invoicePdfUrl','invoiceXmlUrl','paidAt','boldPaymentId'])assert.equal(persisted[key],null);
    assert.ok(persisted.createdAt&&persisted.updatedAt&&persisted.privacyAcceptedAt);
    if(selection.colorMode==='mix'){assert.equal(persisted.color1Percentage,40);assert.equal(persisted.color2Percentage,60);assert.equal(persisted.standardColor,null);}
    else{assert.equal(persisted.standardColor,'arena');assert.equal(persisted.color1,null);}
    for(const value of [customer.document,customer.email,customer.phone,customer.address,'Cliente Prueba'])assert.ok(!JSON.stringify(result).includes(value));
  }
});
test('Invalid customer data, price/total overrides, unknown keys and missing consent never persist or sign',async()=>{
  let calls=0; const factory=()=>({async saveOrder(){calls++;}}), valid={productId:'microcemento-kaemento-launch',...standard,customer};
  for(const change of [{name:''},{name:'<script>'},{name:'Bad\nName'},{documentType:'other'},{document:'12'},{document:'abcde'},
    {email:'not-email'},{email:'a@example.com\nBCC:x@y.com'},{phone:'not-phone'},{phone:'9'.repeat(40)},{city:''},{address:'x'},
    {privacyAccepted:false},{card:'123456'}]) {
    const result=await invoke({...valid,customer:{...customer,...change}},factory);
    assert.equal(result.status,400);assert.equal(result.body.integritySignature,undefined);
  }
  for(const key of Object.keys(customer)){const buyer={...customer};delete buyer[key];assert.equal((await invoke({...valid,customer:buyer},factory)).status,400);}
  for(const change of [{customer:null},{customer:[]},{amount:1},{unitPrice:1},{total:1},{subtotal:1},{currency:'USD'},{paid:true}])assert.equal((await invoke({...valid,...change},factory)).status,400);
  assert.equal(calls,0);
  assert.equal((await invoke(valid,factory,{...env,BOLD_CONFIRMATION_ENABLED:'false'})).status,503);assert.equal(calls,0);
});
test('Email templates are complete, escaped and contain no sensitive financial fields',()=>{
  const order={...payments.orderRecord(id(),mixed,customer),paymentStatus:'paid',paidAt:Date.now(),boldPaymentId:'payment-fixture',boldStatus:'SALE_APPROVED',paymentMethod:'PSE',customerName:'Prueba & <script>'};
  const admin=emails.emailContent(order,'sales'),buyer=emails.emailContent(order,'customer');
  assert.equal(admin.subject,`NUEVA VENTA ONLINE — KAEMENTO — ${order.orderId}`);
  assert.equal(buyer.subject,`Tu pedido KAEMENTO está confirmado — ${order.orderId}`);
  for(const value of ['40 % Arena + 60 % Gris Cemento','Brillante','1.096.500',customer.document,customer.address,'payment-fixture','PSE','SALE_APPROVED'])assert.ok(admin.text.includes(value));
  for(const value of ['Despacho máximo: 48 horas hábiles.','Envíos a todo Colombia.','El transporte no está incluido y su valor es asumido por el cliente.','kaemento@gmail.com','+57 300 367 1548'])assert.ok(buyer.text.includes(value));
  assert.ok(admin.html.includes('Prueba &amp; &lt;script&gt;'));assert.ok(!admin.html.includes('<script>'));
  assert.ok(!buyer.text.includes(customer.document));
  assert.throws(()=>emails.emailContent({...order,paymentStatus:'pending'},'sales'));
  assert.equal(emails.emailConfig({...env,KAEMENTO_EMAIL_ENABLED:'false'}),null);
  assert.deepEqual(emails.emailConfig(env).sales,['ventas@example.invalid','admin@example.invalid']);
});
test('Invoice adapter cannot fabricate an invoice and does not run during payment',async()=>{
  await assert.rejects(invoiceProvider.createInvoice({}),{code:'INVOICE_PROVIDER_NOT_CONFIGURED'});
});
test('Protected retry requires its own server secret and exposes no customer data',async()=>{
  const {handle}=await import('../api/bold/retry-emails.mjs');
  const req=(body={},auth='Bearer '+env.KAEMENTO_EMAIL_RETRY_SECRET)=>new Request('https://example.invalid/api/bold/retry-emails',{method:'POST',headers:{'content-type':'application/json',authorization:auth},body:JSON.stringify(body)});
  let called=0;
  const factory=()=>({async dueEmails(){return [];} });
  assert.equal((await handle(req({},'bad'),env,factory)).status,401);
  assert.equal((await handle(req(),{...env,KAEMENTO_EMAIL_RETRY_SECRET:''},factory)).status,503);
  assert.equal((await handle(req({orderId:'invalid'}),env,factory)).status,400);
  assert.equal((await handle(req({recipient:'other@example.invalid'}),env,factory)).status,400);
  assert.equal((await handle(req({x:'x'.repeat(300)}),env,factory)).status,413);
  assert.equal((await handle(req(),env,factory)).status,200);
  const result=await handle(req({orderId:id()}),env,factory,async()=>{called++;return [{role:'sales',status:'sent'}];});
  assert.equal(result.status,200);assert.equal(called,1);assert.ok(!(await result.text()).includes('@'));
});
test('Persistent payment and email outbox with real Redis', {skip:!process.env.REDIS_SERVER_BIN},async t=>{
  const redis=await redisFixture(); let now=Date.now();
  const store=()=>payments.createStore(env,redis.transport,()=>now);
  const a=store(),b=store();
  async function confirmed(selection=standard){const order=payments.orderRecord(id(),selection,customer);await a.saveOrder(order);const event=notice(order);assert.equal(await a.process(event),'confirmed');return {order:await b.readOrder(order.orderId),event};}
  try {
    await t.test('Concurrent webhooks/workers, replay and a new Function instance produce exactly two messages',async()=>{
      const raw=payments.orderRecord(id(),mixed,customer); await a.saveOrder(raw);const event=notice(raw);
      const results=await Promise.all(Array.from({length:20},(_,n)=>(n%2?a:b).process(event)));
      assert.equal(results.filter(x=>x==='confirmed').length,1);assert.equal(results.filter(x=>x==='duplicate').length,19);
      const order=await b.readOrder(raw.orderId);assert.equal(order.paymentStatus,'paid');assert.equal(order.orderStatus,'paid');assert.equal(order.paymentMethod,'PSE');assert.equal(order.boldPaymentId,event.paymentId);assert.ok(order.paidAt);
      assert.equal(order.invoiceStatus,'pending');assert.equal(order.fulfillmentStatus,'pending');
      const sent=[];const transport=async(url,options)=>{sent.push({url,payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});await new Promise(r=>setTimeout(r,20));return Response.json({id:randomBytes(16).toString('hex')});};
      await Promise.all(Array.from({length:12},()=>emails.deliverOrder(order.orderId,store(),env,transport)));
      assert.equal(sent.length,2);assert.equal(new Set(sent.map(x=>x.key)).size,2);
      assert.deepEqual(sent.find(x=>x.key.includes('/sales/')).payload.to,['ventas@example.invalid','admin@example.invalid']);
      assert.deepEqual(sent.find(x=>x.key.includes('/customer/')).payload.to,[customer.email]);
      assert.equal((await b.readOrder(order.orderId)).emailStatus,'sent');
      assert.equal(await b.process({...event,id:randomBytes(16).toString('hex')}),'duplicate_payment');
      await emails.deliverOrder(order.orderId,store(),env,transport,true);assert.equal(sent.length,2);
      const purchase=JSON.parse(await redis.command(['GET','kaemento:orders-tests:purchase:'+order.orderId]));
      assert.equal(purchase.analyticsStatus,'awaiting_configuration');assert.ok(!JSON.stringify(purchase).includes(customer.email));
    });
    await t.test('Provider failure never reverts payment; retry sends only the failed role',async()=>{
      const {order}=await confirmed();const calls=[];let failing=true;
      const transport=async(_url,options)=>{const key=options.headers['Idempotency-Key'];calls.push(key);return failing&&key.includes('/sales/')?Response.json({error:'PRIVATE'},{status:503}):Response.json({id:randomBytes(16).toString('hex')});};
      await emails.deliverOrder(order.orderId,a,env,transport);
      const saved=await b.readOrder(order.orderId);assert.equal(saved.paymentStatus,'paid');assert.equal(saved.emailStatus,'failed');
      assert.equal((await b.readEmail(order.orderId,'sales')).lastErrorCode,'provider_unavailable');
      await emails.deliverOrder(order.orderId,a,env,transport);assert.equal(calls.length,2,'retry respects backoff');
      failing=false;now+=61000;await emails.deliverOrder(order.orderId,b,env,transport);
      assert.equal(calls.length,3);assert.equal(calls.filter(x=>x.includes('/customer/')).length,1);assert.equal(calls[0],calls[2]);
      assert.equal((await a.readOrder(order.orderId)).emailStatus,'sent');
    });
    await t.test('Lost provider response reuses immutable payload/key; expired ambiguity never resends',async()=>{
      const {order}=await confirmed();const accepted=new Map();let failCommit=true;
      const provider=async(_url,options)=>{const key=options.headers['Idempotency-Key'];if(!accepted.has(key))accepted.set(key,{id:randomBytes(16).toString('hex'),body:options.body});assert.equal(options.body,accepted.get(key).body);return Response.json({id:accepted.get(key).id});};
      const unstable={...a,async finishEmail(...args){if(failCommit){failCommit=false;throw new Error('Simulated storage failure after provider acceptance');}return a.finishEmail(...args);}};
      await assert.rejects(emails.deliverOrder(order.orderId,unstable,env,provider));assert.equal(accepted.size,1);
      now+=61000;
      await emails.deliverOrder(order.orderId,b,{...env,KAEMENTO_SALES_EMAIL:'changed@example.invalid'},provider);
      assert.equal(accepted.size,2);assert.equal((await a.readOrder(order.orderId)).emailStatus,'sent');
      const fresh=await confirmed();const payload=emails.emailPayload(fresh.order,'sales',emails.emailConfig(env));
      await a.claimEmail(fresh.order.orderId,'sales',payload);
      now+=23*60*60*1000;let requests=0;
      await emails.deliverOrder(fresh.order.orderId,b,env,async()=>{requests++;return Response.json({id:'new-id'});},true);
      assert.equal((await b.readEmail(fresh.order.orderId,'sales')).status,'manual_review');assert.equal(requests,1,'only the never-attempted customer email may send');
    });
    await t.test('Missing email configuration is explicit; no provider call and safe later activation',async()=>{
      const {order}=await confirmed();let requests=0;const provider=async()=>{requests++;return Response.json({id:randomBytes(16).toString('hex')});};
      await emails.deliverOrder(order.orderId,a,{...env,KAEMENTO_EMAIL_ENABLED:'false'},provider);
      assert.equal(requests,0);assert.equal((await b.readOrder(order.orderId)).paymentStatus,'paid');assert.equal((await b.readOrder(order.orderId)).emailStatus,'failed');
      assert.equal((await b.readEmail(order.orderId,'sales')).firstAttemptAt,undefined);
      await emails.deliverOrder(order.orderId,b,env,provider,true);assert.equal(requests,2);
    });
    await t.test('Wrong currency/amount, unknown reference, rejection and refund cannot trigger paid emails',async()=>{
      const order=payments.orderRecord(id(),standard,customer);await a.saveOrder(order);const event=notice(order);
      for(const edit of [{currency:'USD'},{amount:1}])assert.equal(await a.process({...event,...edit}),'mismatch');
      assert.equal(await a.process({...event,orderId:id()}),'unknown_order');
      await a.process({...event,type:'SALE_REJECTED'});
      assert.equal((await b.readOrder(order.orderId)).paymentStatus,'failed');
      let sent=0;const provider=async()=>{sent++;return Response.json({id:'unexpected'});};
      await emails.deliverOrder(order.orderId,a,env,provider);assert.equal(sent,0);
      await a.process({...event,id:randomBytes(16).toString('hex')});
      await a.process({...event,id:randomBytes(16).toString('hex'),type:'VOID_APPROVED'});
      await emails.deliverOrder(order.orderId,a,env,provider,true);assert.equal(sent,0);
      assert.equal((await b.readOrder(order.orderId)).orderStatus,'cancelled');
      assert.equal(await redis.command(['ZSCORE','kaemento:orders-tests:email:due',order.orderId+'|sales']),null);
    });
    await t.test('Authenticated webhook ACK is independent from email latency and outbox survives worker failure',async()=>{
      const {handle}=await import('../api/bold/webhook.mjs');const order=payments.orderRecord(id(),standard,customer);await a.saveOrder(order);
      const n=notice(order), raw=JSON.stringify({id:n.id,type:n.type,data:{payment_id:n.paymentId,metadata:{reference:n.orderId},amount:{currency:'COP',total:n.amount},payment_method:'PSE'}});
      const request=new Request('https://example.invalid/api/bold/webhook',{method:'POST',headers:{'content-type':'application/json','x-bold-signature':createHmac('sha256',env.BOLD_SECRET_KEY).update(Buffer.from(raw).toString('base64')).digest('hex')},body:raw});
      let background,release;
      const slow={...a,readOrder:()=>new Promise(r=>{release=r;})};
      const response=await handle(request,env,()=>slow,p=>{background=p;});
      assert.equal(response.status,200);assert.ok(background);assert.equal((await b.readOrder(order.orderId)).paymentStatus,'paid');
      assert.equal((await b.readEmail(order.orderId,'sales')).status,'pending');
      release(null);await background;
    });
  } finally {await redis.close();}
});
