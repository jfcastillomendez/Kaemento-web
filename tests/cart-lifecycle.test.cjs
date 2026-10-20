const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const variants=require('../bold-config.js');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class Element {
 constructor(){this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.children=[];this.events={};this.validity={valid:true};this.options=[];}
 addEventListener(name,fn){(this.events[name]??=[]).push(fn);}
 async emit(name,event={}){for(const fn of this.events[name]||[])await fn(event);}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 setAttribute(name,value){this[name]=value;}
 removeAttribute(name){delete this[name];}
 setCustomValidity(message){this.validity.valid=!message;this.validationMessage=message;}
 reportValidity(){return this.validity.valid;}
 focus(){}
 querySelectorAll(selector){const nodes=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);return selector==='*'?nodes:nodes.filter(n=>selector.split(',').includes(n.tag));}
}
function fixture({customerStep,storage=new Map()}={}) {
 const controls=new Map(),events={},removed=[],opened=[],tracked=[],requests=[],uiEvents=[];
 let notifyPromotion, promotionState = {state:'unknown'};
 const session=new Map([['kaemento-order-access','{"previous":"retained-token"}'],['kaemento-bold-selections','{"previous":{"quantity":1}}']]);
 const panel={dispatchEvent(event){uiEvents.push(event);},querySelector(selector){if(!controls.has(selector))controls.set(selector,new Element());return controls.get(selector);},querySelectorAll(selector){assert.equal(selector,'[data-bold-unit]');return [this.querySelector(selector)];}};
 const control=name=>panel.querySelector(`[data-${name}]`);
 const document={querySelectorAll:()=>[panel],createElement(tag){const el=new Element();el.tag=tag;return el;},head:{appendChild(el){queueMicrotask(()=>el.onload());}}};
 const window={KaementoBoldConfig:variants,KaementoKitCoverage:require('../kit-estimate.js'),KaementoPromotion:{subscribe(fn){notifyPromotion=fn;fn(promotionState);},getState(){return promotionState;}},location:{origin:'https://example.invalid'},addEventListener(name,fn){(events[name]??=[]).push(fn);},kaementoTrack:(...args)=>tracked.push(args),BoldCheckout:class{constructor(config){this.config=config;}async open(){opened.push(this.config);}},KaementoOrderCustomer:{async open(selection,prepare){return customerStep?customerStep(selection,prepare):prepare({name:'Synthetic buyer'},365500);}}};
 const result=selection=>({amount:variants.kitCount(selection)*365500,currency:'COP',tax:'vat-19',selection,orderId:'KAE-CART-TEST',integritySignature:'a'.repeat(64),statusToken:'b'.repeat(64),apiKey:'public-fixture',description:'Synthetic cart'});
 const context={window,document,localStorage:{removeItem:key=>{removed.push(key);storage.delete(key);},getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},sessionStorage:{getItem:key=>session.get(key)||null,setItem:(key,value)=>session.set(key,value)},crypto:webcrypto,TextEncoder,AbortSignal,Intl,URL,console,setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},async fetch(url,options){const body=JSON.parse(options.body);requests.push({url,body});return Response.json(result(variants.restore({items:body.items})));}};
 context.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../bold-checkout.js'),'utf8'),context);
 async function event(name,details={persisted:true}){for(const fn of events[name]||[])await fn(details);await flush();}
 async function add(color,quantity=1,sealer='mate'){
  control('bold-mode').value='standard';control('bold-color').value=color;control('bold-sealer').value=sealer;control('bold-quantity').value=String(quantity);
  await control('bold-mode').emit('change');await control('cart-add').emit('click');
 }
 return {control,add,event,removed,storage,session,opened,tracked,requests,result,uiEvents,promotion:state=>{promotionState={state};notifyPromotion(promotionState);}};
}
test('Finished-material reference follows the current kit price while cart totals remain whole-kit totals',async()=>{
 const f=fixture();
 assert.match(f.control('bold-unit-area').textContent,/36\.550/);
 await f.add('extra-blanco');await f.add('arena',2,'brillante');
 f.control('bold-quantity').value='2';
 for(const state of ['ended','sold_out','upcoming','unknown']) {
  f.promotion(state);
  assert.match(f.control('bold-unit-area').textContent,/43\.000/);
  assert.match(f.control('bold-unit').textContent,/430\.000/);
  assert.match(f.control('bold-total').textContent,/860\.000/);
  assert.match(f.control('cart-total').textContent,/1\.290\.000/);
  assert.equal(f.control('cart-count').textContent,'3 kits');
 }
 f.promotion('active');
 assert.match(f.control('bold-unit-area').textContent,/36\.550/);
 assert.match(f.control('bold-total').textContent,/731\.000/);
 assert.match(f.control('cart-total').textContent,/1\.096\.500/);
 assert.equal(f.requests.length,0);assert.equal(f.opened.length,0);
 assert.deepEqual(f.tracked.map(x=>x[0]),['add_to_cart','add_to_cart']);
});
test('Cart survives reload, page navigation and cross-page return without saving customer data',async()=>{
 const f=fixture();await f.add('extra-blanco');await f.add('arena',2);
 await f.event('pagehide');assert.equal(f.control('cart-count').textContent,'3 kits');
 const saved=JSON.parse(f.storage.get('kaemento-microcemento-cart-v1'));
 assert.deepEqual(Object.keys(saved).sort(),['expiresAt','items','version']);assert.equal(saved.version,2);
 const reloaded=fixture({storage:f.storage});assert.equal(reloaded.control('cart-count').textContent,'3 kits');
 assert.equal(reloaded.control('bold-mode').value,'');assert.equal(reloaded.requests.length,0);
 reloaded.promotion('ended');assert.match(reloaded.control('cart-total').textContent,/1\.290\.000/);
});
test('Expired, oversized and malformed carts are discarded without affecting checkout tokens',()=>{
 for(const value of ['invalid',JSON.stringify({version:2,expiresAt:Date.now()-1,items:[]}),JSON.stringify({version:2,expiresAt:Date.now()+10000,items:[{color:'fake'}]}),'x'.repeat(33000)]){
  const f=fixture({storage:new Map([['kaemento-microcemento-cart-v1',value]])});
  assert.equal(f.control('cart-count').textContent,'0 kits');assert.ok(f.control('bold-buy').disabled);
  assert.equal(f.session.get('kaemento-order-access'),'{'+'"previous":"retained-token"}');
 }
});
test('Back/Forward restores the latest saved cart and clears unfinished controls',async()=>{
 const f=fixture();await f.add('negro');f.control('bold-quantity').value='4';await f.event('pageshow');
 assert.equal(f.control('cart-count').textContent,'1 kit');assert.equal(f.control('bold-quantity').value,'');
 f.storage.delete('kaemento-microcemento-cart-v1');await f.event('pageshow');assert.equal(f.control('cart-count').textContent,'0 kits');
});
test('A cart cleared by the confirmed result in another tab cannot be saved again by the old page',async()=>{
 const f=fixture();await f.add('arena');f.storage.delete('kaemento-microcemento-cart-v1');
 await f.event('storage',{key:'kaemento-microcemento-cart-v1'});assert.equal(f.control('cart-count').textContent,'0 kits');
 await f.event('pagehide');assert.ok(!f.storage.has('kaemento-microcemento-cart-v1'));
});
test('Opening checkout preserves the draft and its independent return token',async()=>{
 const f=fixture();await f.add('extra-blanco');await f.control('bold-buy').emit('click');
 assert.equal(f.opened.length,1);await f.event('pagehide');await f.event('pageshow');
 assert.equal(f.control('cart-count').textContent,'1 kit');assert.equal(JSON.parse(f.session.get('kaemento-order-access'))['KAE-CART-TEST'],'b'.repeat(64));
});
test('More than twenty kits can be added, edited and passed to the existing checkout',async()=>{
 const f=fixture();await f.add('extra-blanco',21);await f.add('arena',30,'brillante');
 assert.equal(f.control('cart-count').textContent,'51 kits');assert.match(f.control('cart-total').textContent,/18\.640\.500/);
 assert.equal(f.control('bold-quantity').value,'');
 const qty=f.control('cart-list').children[0].children[1].children[0].children[0];
 assert.equal(qty.max,undefined);
 qty.value='50';await qty.emit('input');await qty.emit('change');
 assert.equal(f.control('cart-count').textContent,'80 kits');assert.match(f.control('cart-total').textContent,/29\.240\.000/);
 qty.value='-1';await qty.emit('input');assert.ok(f.control('bold-buy').disabled);
 qty.value='50';await qty.emit('input');assert.equal(f.control('bold-buy').disabled,false);
 await f.control('bold-buy').emit('click');
 assert.equal(f.requests.length,1);assert.deepEqual(Array.from(f.requests[0].body.items,x=>x.quantity),[50,30]);
 assert.equal(f.opened.length,1);assert.equal(f.opened[0].amount,'29240000');
 assert.equal(f.tracked.filter(x=>x[0]==='begin_checkout').length,1);
});
test('Leaving during preparation cancels the stale checkout while preserving the cart',async()=>{
 let resolve,selection;const f=fixture({customerStep:s=>{selection=s;return new Promise(r=>{resolve=r;});}});
 await f.add('arena');const checkout=f.control('bold-buy').emit('click');await flush();
 assert.ok(resolve);await f.event('pagehide');await f.event('pageshow');resolve(f.result(selection));await checkout;
 assert.equal(f.opened.length,0);assert.equal(f.tracked.filter(x=>x[0]==='begin_checkout').length,0);assert.equal(f.control('cart-count').textContent,'1 kit');assert.ok(!f.control('bold-buy').disabled);
});

test('Cart measures each committed addition/removal once, including quantity deltas and unchanged edits',async()=>{
 const f=fixture();await f.add('extra-blanco');await f.add('arena',2);
 assert.deepEqual(f.tracked.map(x=>x[0]),['add_to_cart','add_to_cart']);
 assert.deepEqual(f.tracked.map(x=>x[1].value),[365500,731000]);
 const row=f.control('cart-list').children[1],controls=row.children[1],qty=controls.children[0].children[0];
 qty.value='3';await qty.emit('input');assert.equal(f.tracked.length,2);
 await qty.emit('change');await qty.emit('change');assert.equal(f.tracked.length,3);assert.equal(f.tracked.at(-1)[1].items[0].quantity,1);
 await controls.children[2].emit('click');await f.control('cart-add').emit('click');assert.equal(f.tracked.length,3);
 const current=f.control('cart-list').children[1].children[1];
 await current.children[3].emit('click');assert.equal(f.tracked.at(-1)[0],'remove_from_cart');assert.equal(f.tracked.at(-1)[1].items[0].quantity,3);
 assert.equal(f.control('cart-count').textContent,'1 kit');
 const count=f.tracked.length;await f.event('pagehide');assert.equal(f.tracked.length,count);
});

test('Preview receives accepted selections and retains them during navigation',async()=>{
 const f=fixture();await f.add('arena',2,'brillante');
 const added=f.uiEvents.filter(e=>e.type==='kaemento:configuration-added');
 assert.equal(added.length,1);assert.equal(added[0].detail.color,'arena');assert.equal(added[0].detail.quantity,2);
 assert.equal(f.control('bold-mode').value,'');assert.equal(f.control('bold-quantity').value,'');
 await f.add('negro',Number.MAX_SAFE_INTEGER);
 assert.equal(f.uiEvents.filter(e=>e.type==='kaemento:configuration-added').length,1,'invalid quantities cannot update the visual reference');
 await f.event('pagehide');
 assert.equal(f.uiEvents.filter(e=>e.type==='kaemento:cart-updated').at(-1).detail.items.length,1);
});
