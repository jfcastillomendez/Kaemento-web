const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const key='kaemento-whatsapp-consultation-v1';
function fixture(store=new Map(),path='/productos/microcemento-kaemento.html') {
  const events={},timers=[],panel={},restored=[];let now=10000000;
  const on=(name,fn)=>(events[name]??=[]).push(fn);
  const document={hidden:false,querySelectorAll:()=>[panel],addEventListener:on};
  const window={addEventListener:on},location={pathname:path,origin:'https://fixture.invalid',href:'https://fixture.invalid'+path};
  vm.runInNewContext(fs.readFileSync(require.resolve('../microcemento-consultation.js'),'utf8'),{
    window,document,location,URL,Date:{now:()=>now},setTimeout:fn=>timers.push(fn),
    sessionStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)}
  });
  const handoff=window.KaementoConsultation;
  handoff.register(panel,'cart',{save:()=>({items:[{color:'arena',quantity:3}]}),restore:value=>restored.push(value)});
  return {store,restored,document,handoff,event:(name,e={})=>(events[name]||[]).forEach(fn=>fn(e)),tick:()=>timers.splice(0).forEach(fn=>fn()),advance:ms=>{now+=ms;}};
}
test('WhatsApp return survives visibility/focus before BFCache pageshow and consumes its ticket',()=>{
  const f=fixture();f.handoff.arm();assert.ok(f.store.has(key));
  f.event('pagehide');f.document.hidden=false;f.event('visibilitychange');f.event('focus');f.tick();
  assert.ok(f.handoff.keep(),'the suspended page must wait for pageshow');
  f.event('pageshow',{persisted:true});assert.ok(f.handoff.keep(),'later pageshow listeners preserve the cart');
  assert.ok(!f.store.has(key));f.tick();assert.ok(!f.handoff.keep());
});
test('Cold return restores the original route once and no ticket enters normal visits',()=>{
  const f=fixture();f.handoff.arm();f.event('pagehide');
  const returned=fixture(f.store);assert.equal(returned.restored.length,1);assert.equal(returned.restored[0].items[0].quantity,3);assert.ok(!f.store.has(key));
  assert.equal(fixture(f.store).restored.length,0);
  f.handoff.arm();assert.equal(fixture(f.store,'/').restored.length,0);
});
test('Continuing in the original tab cancels the exception; new-tab return leaves no persistent cart',()=>{
  const f=fixture();f.handoff.arm();f.event('pointerdown');assert.ok(!f.handoff.keep());assert.ok(!f.store.has(key));
  f.handoff.arm();f.event('blur');f.event('focus');f.tick();assert.ok(!f.handoff.keep());assert.ok(!f.store.has(key));
});
test('Expired and malformed tickets cannot restore a cart',()=>{
  const f=fixture();f.handoff.arm();f.advance(2*60*60*1000+1);assert.ok(!f.handoff.keep());f.event('pagehide');assert.ok(!f.store.has(key));
  const store=new Map([[key,'{invalid']]);assert.equal(fixture(store).restored.length,0);assert.ok(!store.has(key));
});
