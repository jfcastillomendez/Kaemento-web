const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const handler = require('../api/bold/checkout.js');
const root = path.resolve(__dirname, '..');
// Ephemeral unit-test fixtures only: never valid Bold keys and never used with Bold.
const saved = { identity: process.env.BOLD_IDENTITY_KEY, secret: process.env.BOLD_SECRET_KEY };
const fixtureIdentity = randomBytes(16).toString('hex');
const fixtureSecret = randomBytes(32).toString('hex');
beforeEach(() => { process.env.BOLD_IDENTITY_KEY = fixtureIdentity; process.env.BOLD_SECRET_KEY = fixtureSecret; });
after(() => {
  for (const [key, value] of [['BOLD_IDENTITY_KEY', saved.identity], ['BOLD_SECRET_KEY', saved.secret]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function invoke(body, method = 'POST', type = 'application/json') {
  const out = { headers: {} };
  handler({ method, headers: { 'content-type': type }, body }, {
    setHeader(k, v) { out.headers[k] = v; },
    set statusCode(v) { out.status = v; }, end(v) { out.body = JSON.parse(v); }
  });
  return out;
}
for (const quantity of [1, 2, 20]) test(`Authoritative total, IVA and signature for ${quantity} kits`, () => {
  const r = invoke({ productId: 'microcemento-kaemento-launch', colorMode: 'standard', color: 'arena', sealer: 'mate', quantity });
  assert.equal(r.status, 200); assert.equal(r.body.amount, 365500 * quantity);
  assert.equal(r.body.tax, 'vat-19'); assert.equal(r.body.currency, 'COP');
  assert.match(r.body.orderId, /^[A-Za-z0-9_-]{1,60}$/);
  assert.equal(r.body.integritySignature, createHash('sha256').update(`${r.body.orderId}${r.body.amount}COP${fixtureSecret}`).digest('hex'));
  assert.deepEqual(Object.keys(r.body).sort(), ['orderId','amount','currency','apiKey','integritySignature','tax','description','selection'].sort());
  assert.ok(!JSON.stringify(r).includes(fixtureSecret));
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.ok(r.body.description.length >= 2 && r.body.description.length <= 100);
});
test('Unique order IDs for separate attempts', () => {
  const ids = new Set(Array.from({ length: 100 }, () => invoke({ productId: 'microcemento-kaemento-launch', colorMode: 'standard', color: 'arena', sealer: 'mate', quantity: 1 }).body.orderId));
  assert.equal(ids.size, 100);
});
test('Reject invalid quantities, products and browser supplied totals', () => {
  for (const quantity of [0, -1, 21, 1.1, '2', null, true, [], {}, NaN, Infinity]) {
    assert.equal(invoke({ productId: 'microcemento-kaemento-launch', colorMode: 'standard', color: 'arena', sealer: 'mate', quantity }).status, 400);
  }
  for (const body of [null, [], {}, 'invalid JSON', {productId:'other',quantity:1},
      {productId:'__proto__',quantity:1}, {productId:'microcemento-kaemento-launch',colorMode:'standard',color:'arena',sealer:'mate',quantity:1,amount:1},
      {productId:'microcemento-kaemento-launch',colorMode:'standard',color:'arena',sealer:'mate',quantity:1,currency:'USD'}]) assert.equal(invoke(body).status,400);
});
test('Method, media type, oversized request and missing keys fail closed', () => {
  assert.equal(invoke({}, 'GET').status, 405);
  assert.equal(invoke({}, 'POST', 'text/plain').status, 415);
  assert.equal(invoke('x'.repeat(1025)).status, 413);
  delete process.env.BOLD_SECRET_KEY;
  assert.equal(invoke({productId:'microcemento-kaemento-launch',colorMode:'standard',color:'arena',sealer:'mate',quantity:1}).status,503);
});
test('Analytics allows only bounded non-personal checkout data through both layers', () => {
  let parentListener, bridgeListener;
  const frame = { contentWindow: { postMessage() {} }, setAttribute() {} };
  const location = { pathname:'/index.html', origin:'https://preview.example', hostname:'preview.example', search:'' };
  const sandbox = { URL, URLSearchParams, location,
    document: { referrer:'', addEventListener(_, fn){fn();}, createElement(){return frame;}, body:{appendChild(){}} },
    sessionStorage: {getItem(){return null;},setItem(){}},
    window: {addEventListener(_,fn){parentListener=fn;}} };
  vm.runInNewContext(fs.readFileSync(path.join(root,'analytics.js'),'utf8'),sandbox);
  const send = sandbox.window.kaementoTrack;
  send('begin_checkout',{currency:'COP',value:731000,items:[{quantity:2,item_variant:'arena',sealer_type:'mate',item_name:'PRIVATE-NAME'}],email:'PRIVATE-EMAIL',orderId:'PRIVATE-ORDER'});
  const event = sandbox.window.dataLayer.at(-1);
  assert.equal(event.event,'begin_checkout');
  assert.equal(event.items[0].item_name,'Microcemento KAEMENTO');
  assert.ok(!JSON.stringify(event).includes('PRIVATE'));
  const count=sandbox.window.dataLayer.length;
  send('purchase',{});send('generate_lead',{});send('begin_checkout',{currency:'COP',value:1,items:[{quantity:2}]});
  assert.equal(sandbox.window.dataLayer.length,count);
  const parent = {postMessage(){}};
  const bridge = { URLSearchParams, location, parent, window:{dataLayer:[],addEventListener(_,fn){bridgeListener=fn;}} };
  bridge.dataLayer=bridge.window.dataLayer;
  vm.runInNewContext(fs.readFileSync(path.join(root,'analytics-bridge.js'),'utf8'),bridge);
  bridgeListener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:'begin_checkout',params:{...event,email:'PRIVATE'}}});
  const args=bridge.dataLayer.at(-1);
  assert.equal(args[1],'begin_checkout');assert.equal(args[2].value,731000);
  assert.ok(!JSON.stringify(args).includes('PRIVATE'));
  const mixed={...event,items:[{quantity:2,item_variant:'arena:70+gris-cemento:30',sealer_type:'mate'}]};
  bridgeListener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:'begin_checkout',params:mixed}});
  assert.equal(bridge.dataLayer.at(-1)[2].items[0].item_variant,'arena:70+gris-cemento:30');
  const beforeBad=bridge.dataLayer.length;
  for (const variant of ['arena:70+arena:30','arena:70+negro:40','PRIVATE']) {
    bridgeListener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:'begin_checkout',params:{...mixed,items:[{quantity:2,item_variant:variant,sealer_type:'mate'}]}}});
  }
  assert.equal(bridge.dataLayer.length,beforeBad);
  const n=bridge.dataLayer.length;
  for(const name of ['purchase','generate_lead'])bridgeListener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:name,params:{}}});
  assert.equal(bridge.dataLayer.length,n);
});

test('Every allowed color and sealer combination keeps price and canonical description', () => {
  for(const color of ['extra-blanco','arena','gris-cemento','negro','terracota']) for(const sealer of ['mate','brillante']) {
    const r=invoke({productId:'microcemento-kaemento-launch',quantity:2,colorMode:'standard',color,sealer});
    assert.equal(r.status,200);assert.equal(r.body.amount,731000);
    assert.deepEqual(r.body.selection,{quantity:2,colorMode:'standard',color,sealer});
    assert.ok(r.body.description.length<=100);assert.ok(r.body.description.endsWith('2 kits'));
    assert.ok(r.body.description.includes(sealer==='mate'?'| Mate |':'| Brillante |'));
  }
});
test('Missing or manipulated variants never produce order or signature, even without keys', () => {
  delete process.env.BOLD_SECRET_KEY;
  const valid={productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',color:'arena',sealer:'mate'};
  for(const key of ['color','sealer']) {
    for(const value of ['',null,undefined,[],{},true,'__proto__','constructor','<script>','ARENA','matte']) {
      const r=invoke({...valid,[key]:value});assert.equal(r.status,400);
      assert.equal(r.body.orderId,undefined);assert.equal(r.body.integritySignature,undefined);
    }
    const body={...valid};delete body[key];assert.equal(invoke(body).status,400);
  }
});

test('All ordered tone pairs and nine ratios are valid, bounded and priced identically', () => {
 const colors=['extra-blanco','arena','gris-cemento','negro','terracota'];
 let count=0;
 for(const color1 of colors)for(const color2 of colors)if(color1!==color2)for(const percentage1 of [10,20,30,40,50,60,70,80,90])for(const sealer of ['mate','brillante']) {
  const r=invoke({productId:'microcemento-kaemento-launch',quantity:2,colorMode:'mix',color1,color2,percentage1,percentage2:100-percentage1,sealer});
  assert.equal(r.status,200);assert.equal(r.body.amount,731000);assert.ok(r.body.description.length<=100);
  assert.ok(r.body.description.includes(`${percentage1}%`));assert.equal(r.body.selection.colorMode,'mix');count++;
 }
 assert.equal(count,360);
});
test('Manipulated formulas fail before any signing, including same tones and totals other than 100', () => {
 delete process.env.BOLD_SECRET_KEY;
 const valid={productId:'microcemento-kaemento-launch',quantity:2,colorMode:'mix',color1:'arena',color2:'gris-cemento',percentage1:70,percentage2:30,sealer:'mate'};
 for(const change of [{color1:'INVALID'},{color2:'gris'},{color2:'arena'},{percentage1:71,percentage2:29},{percentage1:70,percentage2:40},{percentage1:'70'},{percentage2:null},{percentage1:0,percentage2:100},{colorMode:'other'},{sealer:'INVALID'},{quantity:0},{quantity:'2'},{color:'arena'}]) {
  const r=invoke({...valid,...change});assert.equal(r.status,400);assert.equal(r.body.orderId,undefined);assert.equal(r.body.integritySignature,undefined);
 }
 const standard={productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',color:'arena',sealer:'mate',color1:'negro'};
 assert.equal(invoke(standard).status,400);
});
