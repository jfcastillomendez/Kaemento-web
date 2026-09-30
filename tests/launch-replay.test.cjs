const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({reduced=false,deferred=false}={}) {
 const frames=new Map(),timers=new Map(),events={},windowEvents={},mediaEvents={};let serial=0,resolveDecode;
 const layers=[];const classes=()=>{const set=new Set();return {add:x=>set.add(x),remove:x=>set.delete(x),contains:x=>set.has(x)};};
 const decoded=deferred?new Promise(resolve=>{resolveDecode=resolve;}):Promise.resolve();
 const art={isConnected:true,querySelector:()=>({decode:()=>decoded}),appendChild:layer=>layers.push(layer)};
 const target={classList:classes(),closest:()=>art};
 const media={matches:reduced,addEventListener:(event,fn)=>{mediaEvents[event]=fn;}};
 const observers=[];
 class Observer {constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){}}
 const document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[target],addEventListener:(event,fn)=>{events[event]=fn;},createElement(){
  const text={textContent:'0%'};const layer={classList:classes(),setAttribute(){},querySelector:()=>text,remove(){const i=layers.indexOf(layer);if(i>=0)layers.splice(i,1);}};return layer;
 }};
 const context={document,matchMedia:()=>media,IntersectionObserver:Observer,performance:{now:()=>0},window:{IntersectionObserver:Observer,addEventListener:(event,fn)=>{windowEvents[event]=fn;}},requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),setTimeout:fn=>{const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(fs.readFileSync(require.resolve('../official-launch-piece.js'),'utf8'),context);
 return {layers,frames,timers,target,document,media,resolveDecode,async enter(ratio=1){observers[0].callback([{target,isIntersecting:ratio>0,intersectionRatio:ratio}]);await flush();},frame(now){const f=[...frames.values()];frames.clear();f.forEach(fn=>fn(now));},finish(){const t=[...timers.values()];timers.clear();t.forEach(fn=>fn());},async visibility(hidden){document.hidden=hidden;events.visibilitychange();await flush();},async motion(value){media.matches=value;mediaEvents.change();await flush();},windowEvents};
}
test('Discount replays on a real exit/re-entry, without flickering near the visibility threshold',async()=>{
 const f=fixture();await f.enter();assert.equal(f.layers.length,1);f.frame(700);assert.equal(f.layers[0].querySelector().textContent,'13%');
 await f.enter(.4);await f.enter(.6);assert.equal(f.layers.length,1);
 f.frame(1400);assert.equal(f.layers[0].querySelector().textContent,'15%');f.finish();assert.equal(f.layers.length,0);
 await f.enter(1);assert.equal(f.layers.length,0);
 await f.enter(0);assert.ok(f.target.classList.contains('campaign-offer-inactive'));
 await f.enter(1);assert.equal(f.layers.length,1);assert.equal(f.layers[0].querySelector().textContent,'0%');
 assert.ok(!f.target.classList.contains('campaign-offer-inactive'));
});
test('Leaving during image decoding cannot leave duplicate counters or a stale animation',async()=>{
 const f=fixture({deferred:true});await f.enter(1);await f.enter(0);await f.enter(1);f.resolveDecode();await flush();assert.equal(f.layers.length,1);
 await f.enter(0);assert.equal(f.layers.length,0);assert.equal(f.frames.size,0);
});
test('Tab return replays the discount and reduced motion cancels all animated counters',async()=>{
 const f=fixture();await f.enter();await f.visibility(true);assert.equal(f.layers.length,0);assert.equal(f.frames.size,0);
 await f.visibility(false);assert.equal(f.layers.length,1);assert.equal(f.layers[0].querySelector().textContent,'0%');
 await f.motion(true);assert.equal(f.layers.length,0);assert.ok(f.target.classList.contains('campaign-offer-inactive'));
 await f.motion(false);assert.equal(f.layers.length,1);
 f.windowEvents.pagehide();assert.equal(f.layers.length,0);f.windowEvents.pageshow();await flush();assert.equal(f.layers.length,1);
 const reduced=fixture({reduced:true});await reduced.enter();assert.equal(reduced.layers.length,0);
});
