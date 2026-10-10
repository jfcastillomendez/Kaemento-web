const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'..','launch-availability.js'),'utf8');
function fixture() {
  let now = Date.parse('2026-10-10T12:00:00Z'), calls = 0, nextId = 0;
  let data = {state:'active',remaining:24,capacity:30,endsAt:'2026-11-18T00:29:14Z'}, ok = true;
  const timers = new Map(), events = {};
  const document = {hidden:false,querySelectorAll(){return [];},addEventListener(name,fn){events[name]=fn;}};
  const window = {addEventListener(name,fn){events[name]=fn;}};
  const sandbox = {window,document,Date:class extends Date {static now(){return now;}},AbortSignal,
    setTimeout(fn,delay){timers.set(++nextId,{fn,at:now+delay});return nextId;},clearTimeout(id){timers.delete(id);},
    async fetch(url,options){assert.equal(url,'/api/bold/promotion');assert.equal(options.cache,'no-store');calls++;return {ok,json:async()=>data};}};
  vm.runInNewContext(source,sandbox);
  const flush = async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  return {api:window.KaementoPromotion,document,events,flush,
    calls:()=>calls,set(value,status=true){data=value;ok=status;},
    async advance(ms){now+=ms;for(const [id,timer] of [...timers]) if(timer.at<=now){timers.delete(id);timer.fn();}await flush();}
  };
}
test('Shared promotion subscribers use one request and stop polling while the page is hidden',async()=>{
  const f=fixture(), first=[],second=[];
  const stopA=f.api.subscribe(x=>first.push(x.state)),stopB=f.api.subscribe(x=>second.push(x.state));
  await f.flush();assert.equal(f.calls(),1);assert.equal(first.at(-1),'active');assert.equal(second.at(-1),'active');
  const snapshot=f.api.getState();snapshot.state='ended';assert.equal(f.api.getState().state,'active');
  f.document.hidden=true;f.events.visibilitychange();await f.advance(120000);assert.equal(f.calls(),1);
  f.document.hidden=false;f.events.visibilitychange();await f.flush();assert.equal(f.calls(),2);
  stopA();stopB();await f.advance(120000);assert.equal(f.calls(),2);
});
test('Availability failures and malformed responses remove any active discount claim',async()=>{
  const f=fixture();f.api.subscribe(()=>{});await f.flush();assert.equal(f.api.getState().state,'active');
  f.set({},false);await f.advance(60000);assert.equal(f.api.getState().state,'unknown');
  f.set({state:'active',capacity:30,remaining:-1,endsAt:'2026-11-18T00:29:14Z'});await f.advance(60000);assert.equal(f.api.getState().state,'unknown');
  f.set({state:'active',capacity:30,remaining:24});await f.advance(60000);assert.equal(f.api.getState().state,'unknown');
});
test('The published deadline closes the offer even if a cached server response still says active',async()=>{
  const f=fixture();f.set({state:'active',capacity:30,remaining:24,endsAt:'2026-10-10T12:00:02Z'});
  const states=[];f.api.subscribe(x=>states.push(x.state));await f.flush();assert.equal(states.at(-1),'active');
  f.events.pageshow(); // Resuming must not postpone the deadline behind the request throttle.
  await f.advance(2000);assert.equal(states.at(-1),'ended');assert.equal(f.api.getState().state,'ended');
});
test('No remaining quota is presented as sold out and server lifecycle states are preserved',async()=>{
  for(const state of ['upcoming','ended','sold_out','active']) {
    const f=fixture();f.set({state,capacity:30,remaining:0,endsAt:'2026-11-18T00:29:14Z'});
    f.api.subscribe(()=>{});await f.flush();assert.equal(f.api.getState().state,state==='active'?'sold_out':state);
  }
});
