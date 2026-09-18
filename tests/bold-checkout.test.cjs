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
  const r = invoke({ productId: 'microcemento-kaemento-launch', quantity });
  assert.equal(r.status, 200); assert.equal(r.body.amount, 365500 * quantity);
  assert.equal(r.body.tax, 'vat-19'); assert.equal(r.body.currency, 'COP');
  assert.match(r.body.orderId, /^[A-Za-z0-9_-]{1,60}$/);
  assert.equal(r.body.integritySignature, createHash('sha256').update(`${r.body.orderId}${r.body.amount}COP${fixtureSecret}`).digest('hex'));
  assert.deepEqual(Object.keys(r.body).sort(), ['orderId','amount','currency','apiKey','integritySignature','tax','description'].sort());
  assert.ok(!JSON.stringify(r).includes(fixtureSecret));
  assert.equal(r.headers['Cache-Control'], 'no-store');
  assert.ok(r.body.description.length >= 2 && r.body.description.length <= 100);
});
test('Unique order IDs for separate attempts', () => {
  const ids = new Set(Array.from({ length: 100 }, () => invoke({ productId: 'microcemento-kaemento-launch', quantity: 1 }).body.orderId));
  assert.equal(ids.size, 100);
});
test('Reject invalid quantities, products and browser supplied totals', () => {
  for (const quantity of [0, -1, 21, 1.1, '2', null, true, [], {}, NaN, Infinity]) {
    assert.equal(invoke({ productId: 'microcemento-kaemento-launch', quantity }).status, 400);
  }
  for (const body of [null, [], {}, 'invalid JSON', {productId:'other',quantity:1},
      {productId:'__proto__',quantity:1}, {productId:'microcemento-kaemento-launch',quantity:1,amount:1},
      {productId:'microcemento-kaemento-launch',quantity:1,currency:'USD'}]) assert.equal(invoke(body).status,400);
});
test('Method, media type, oversized request and missing keys fail closed', () => {
  assert.equal(invoke({}, 'GET').status, 405);
  assert.equal(invoke({}, 'POST', 'text/plain').status, 415);
  assert.equal(invoke('x'.repeat(1025)).status, 413);
  delete process.env.BOLD_SECRET_KEY;
  assert.equal(invoke({productId:'microcemento-kaemento-launch',quantity:1}).status,503);
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
  send('begin_checkout',{currency:'COP',value:731000,items:[{quantity:2,item_name:'PRIVATE-NAME'}],email:'PRIVATE-EMAIL',orderId:'PRIVATE-ORDER'});
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
  const n=bridge.dataLayer.length;
  for(const name of ['purchase','generate_lead'])bridgeListener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:name,params:{}}});
  assert.equal(bridge.dataLayer.length,n);
});
