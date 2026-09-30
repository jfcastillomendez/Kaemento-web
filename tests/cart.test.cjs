const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),vm=require('node:vm');
const variants=require('../bold-config.js');
const {createCheckout}=require('../api/bold/checkout.js');
const payments=require('../api/bold/_lib/payments.cjs');
const emails=require('../api/bold/_lib/order-emails.cjs');
const {customer,checkoutStore}=require('./helpers/orders.cjs');
const {redisFixture}=require('./helpers/redis.cjs');
const line=(color,quantity=1,sealer='mate')=>({productId:'microcemento-kaemento-launch',colorMode:'standard',color,quantity,sealer});
const mix={productId:'microcemento-kaemento-launch',colorMode:'mix',color1:'arena',percentage1:70,color2:'gris-cemento',percentage2:30,quantity:2,sealer:'brillante'};
const env={BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),BOLD_SECRET_KEY:randomBytes(32).toString('hex'),KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'cart-tests',KAEMENTO_EMAIL_ENABLED:'true',RESEND_API_KEY:randomBytes(32).toString('hex'),KAEMENTO_EMAIL_FROM:'KAEMENTO <pedidos@example.invalid>',KAEMENTO_SALES_EMAIL:'sales@example.invalid,admin@example.invalid'};
async function invoke(configuration,store={async saveOrder(){}}){const out={};await createCheckout(env,()=>checkoutStore(store))({method:'POST',headers:{'content-type':'application/json'},body:{...configuration,customer}},{setHeader(){},set statusCode(x){out.status=x;},end(x){out.body=JSON.parse(x);}});return out;}
test('One Extra Blanco and two Arena persist as two lines before one signed checkout',async()=>{
 let saved;const out=await invoke({items:[line('extra-blanco'),line('arena',2)]},{async saveOrder(order){saved=order;}});
 assert.equal(out.status,200);assert.equal(out.body.amount,1096500);assert.equal(saved.orderId,out.body.orderId);
 assert.equal(saved.schemaVersion,3);assert.equal(saved.quantity,3);assert.equal(saved.items.length,2);assert.equal(saved.items[1].subtotal,731000);assert.equal(saved.total,out.body.amount);
 assert.equal(saved.customerEmail,customer.email);assert.ok(out.body.description.length<=100);
 assert.equal(saved.paymentStatus,'pending');assert.equal(saved.invoiceStatus,'pending');assert.equal(saved.invoiceNumber,null);
 assert.ok(!JSON.stringify(out).includes(customer.email));
});
test('Cart combines identical formulas including reversed tone order, but keeps distinct sealers',()=>{
 const selection=variants.normalizeCart({items:[line('arena',2),line('arena',3),line('arena',1,'brillante'),mix,{...mix,color1:mix.color2,color2:mix.color1,percentage1:30,percentage2:70}]});
 assert.equal(selection.items.length,3);assert.deepEqual(selection.items.map(x=>x.quantity),[5,1,4]);assert.equal(variants.kitCount(selection),10);
});
test('Every color/sealer and a mix can coexist; max twenty kits is aggregate',async()=>{
 const items=[...variants.colors.keys()].flatMap(c=>[line(c),line(c,1,'brillante')]);items.push(mix);
 const out=await invoke({items});assert.equal(out.status,200);assert.equal(out.body.amount,4386000);
 assert.equal((await invoke({items:[line('extra-blanco',10),line('arena',10)]})).status,200);
 assert.equal((await invoke({items:[line('extra-blanco',10),line('arena',11)]})).status,400);
});
test('Invalid cart lines, injected prices and malformed data fail before storage/signature',async()=>{
 let calls=0;const store={async saveOrder(){calls++;}};
 for(const data of [{items:[]},{items:null},{items:[null]},{items:Array(21).fill(line('arena'))},{items:[line('arena'),{...line('negro'),quantity:'2'}]},{items:[{...line('arena'),price:1}]},{items:[{...line('arena'),sealer:'other'}]},{items:[{...line('arena'),color:'beige'}]},{items:[{...mix,percentage2:20}]},{items:[{...mix,color2:'arena'}]},{items:[line('arena')],total:1},{items:[line('arena')],productId:'other'}]) {
 const out=await invoke(data,store);assert.equal(out.status,400);assert.equal(out.body.integritySignature,undefined);
 }assert.equal(calls,0);
 const out=await invoke({items:[line('arena')]},{async saveOrder(){throw new Error('offline');}});assert.equal(out.status,503);assert.equal(out.body.integritySignature,undefined);
});
test('Anonymous multi-line begin_checkout crosses both privacy boundaries once; no lead or PII',()=>{
 let listener;const location={pathname:'/productos/microcemento-kaemento.html',origin:'http://localhost:8000',hostname:'localhost',search:'?gtm_debug=x'};
 const frame={contentWindow:{postMessage(){}},setAttribute(){}};
 const context={URL,URLSearchParams,location,document:{referrer:'',addEventListener(_,fn){fn();},createElement(){return frame;},body:{appendChild(){}}},sessionStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync('analytics.js','utf8'),context);
 const params={currency:'COP',value:1096500,items:[{quantity:1,item_variant:'extra-blanco',sealer_type:'mate',email:'PRIVATE'},{quantity:2,item_variant:'arena',sealer_type:'brillante',name:'PRIVATE'}],email:'PRIVATE',message:'PRIVATE',phone:'PRIVATE'};
 context.window.kaementoTrack('begin_checkout',params);const event=context.window.dataLayer.at(-1);assert.equal(event.items.length,2);assert.equal(event.value,1096500);assert.ok(!JSON.stringify(event).includes('PRIVATE'));
 const before=context.window.dataLayer.length;context.window.kaementoTrack('generate_lead',params);context.window.kaementoTrack('begin_checkout',{...params,value:1});assert.equal(context.window.dataLayer.length,before);
 const parent={postMessage(){}};const bridge={URLSearchParams,location,parent,window:{dataLayer:[],addEventListener(_,fn){listener=fn;}}};bridge.dataLayer=bridge.window.dataLayer;vm.runInNewContext(fs.readFileSync('analytics-bridge.js','utf8'),bridge);
 listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:'begin_checkout',params}});
 const result=bridge.dataLayer.at(-1);assert.equal(result[2].items.length,2);assert.equal(result[2].debug_mode,true);assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});
test('Cart payment, duplicate webhooks and itemized independent emails use real Redis',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try {
 const store=payments.createStore(env,redis.transport);const result=await invoke({items:[line('extra-blanco'),line('arena',2),mix]},store);
 assert.equal(result.status,200);const orderId=result.body.orderId;
 const event={id:'cart-event',type:'SALE_APPROVED',paymentId:'cart-payment',orderId,amount:result.body.amount,currency:'COP'};
 assert.equal(await store.process({...event,amount:1}),'mismatch');
 const outcomes=await Promise.all(Array.from({length:10},()=>store.process(event)));assert.equal(outcomes.filter(x=>x==='confirmed').length,1);
 const order=await store.readOrder(orderId);assert.equal(order.paymentStatus,'paid');assert.equal(order.items.length,3);
 const sent=[];const transport=async(_url,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:'fixture-'+sent.length});};
 await emails.deliverOrder(orderId,store,env,transport);await emails.deliverOrder(orderId,store,env,transport);
 assert.equal(sent.length,2);for(const mail of sent){for(const value of ['Extra Blanco','Arena','70 % Arena + 30 % Gris Cemento','Brillante','1.827.500'])assert.ok(mail.text.includes(value));}
 const purchase=payments.purchaseEvent(order);assert.equal(purchase.params.items.length,3);assert.ok(!JSON.stringify(purchase).includes(customer.email));
 }finally{await redis.close();}
});
