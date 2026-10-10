const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
test('Promotion measurement only accepts the fixed campaign and strips personal fields in both layers',()=>{
 const location={pathname:'/index.html',origin:'https://preview.example',hostname:'preview.example',search:''};
 const frame={contentWindow:{postMessage(){}},setAttribute(){}};
 const sandbox={URL,URLSearchParams,location,document:{referrer:'',addEventListener(_,fn){fn();},createElement(){return frame;},body:{appendChild(){}}},sessionStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'analytics.js'),'utf8'),sandbox);
 let listener;const parent={postMessage(){}};const bridge={URL,URLSearchParams,location,parent,dataLayer:[],window:{addEventListener(_,fn){listener=fn;}}};bridge.window.dataLayer=bridge.dataLayer;
 vm.runInNewContext(fs.readFileSync(path.join(root,'analytics-bridge.js'),'utf8'),bridge);
 for(const name of ['select_promotion','view_promotion']){
  const params={promotion_name:'microcemento_kaemento_launch_2026',name:'PRIVATE',email:'PRIVATE',phone:'PRIVATE',message:'PRIVATE'};
  sandbox.window.kaementoTrack(name,params);
  const event=sandbox.window.dataLayer.at(-1);assert.equal(event.event,name);assert.equal(event.promotion_name,params.promotion_name);assert.ok(!JSON.stringify(event).includes('PRIVATE'));
  listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:name,params}});
  assert.equal(bridge.dataLayer.at(-1)[1],name);assert.ok(!JSON.stringify(bridge.dataLayer.at(-1)).includes('PRIVATE'));
  const n=sandbox.window.dataLayer.length,m=bridge.dataLayer.length;
  for(const value of [undefined,'PRIVATE','other']){
   sandbox.window.kaementoTrack(name,{promotion_name:value});
   listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:name,params:{promotion_name:value}}});
  }
  assert.equal(sandbox.window.dataLayer.length,n);assert.equal(bridge.dataLayer.length,m);
 }
 for(const name of ['microcemento_simulator_open','microcemento_simulator_start']) {
  const params={button_id:'color-preview',name:'PRIVATE',email:'PRIVATE',phone:'PRIVATE',value:365500,transaction_id:'PRIVATE'};
  sandbox.window.kaementoTrack(name,params);
  const event=sandbox.window.dataLayer.at(-1);
  assert.equal(event.event,name);assert.equal(event.button_id,'color-preview');assert.ok(!JSON.stringify(event).includes('PRIVATE'));assert.equal(event.value,undefined);
  listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:name,params}});
  assert.equal(bridge.dataLayer.at(-1)[1],name);assert.ok(!JSON.stringify(bridge.dataLayer.at(-1)).includes('PRIVATE'));assert.equal(bridge.dataLayer.at(-1)[2].value,undefined);
 }
});
test('Campaign configuration matches the approved server price without changing checkout',()=>{
 const box={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'microcemento-launch-config.js'),'utf8'),box);
 const c=box.window.KaementoLaunchCampaign;assert.equal(c.launchPrice,365500);assert.equal(c.regularPrice*(100-c.discount)/100,c.launchPrice);assert.equal(c.maxCustomers,30);assert.equal(c.durationDays,60);
});
test('Product view is emitted once on the product route with a fixed public item and no supplied personal fields',()=>{
 const frame={contentWindow:{postMessage(){}},setAttribute(){}},location={pathname:'/productos/microcemento-kaemento.html',origin:'https://preview.example',hostname:'preview.example',search:'?servicio=PRIVATE'};
 const sandbox={URL,URLSearchParams,location,document:{referrer:'',addEventListener(_,fn){fn();},createElement(){return frame;},body:{appendChild(){}}},sessionStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'analytics.js'),'utf8'),sandbox);
 assert.equal(sandbox.window.dataLayer.filter(x=>x.event==='view_item').length,1);
 sandbox.window.kaementoTrack('view_item',{items:[{item_name:'PRIVATE',phone:'PRIVATE'}],email:'PRIVATE',message:'PRIVATE'});
 const event=sandbox.window.dataLayer.at(-1);assert.equal(event.items[0].item_name,'Microcemento KAEMENTO');assert.ok(!JSON.stringify(event).includes('PRIVATE'));
 let listener;const parent={postMessage(){}},bridge={URLSearchParams,location,parent,dataLayer:[],window:{addEventListener(_,fn){listener=fn;}}};bridge.window.dataLayer=bridge.dataLayer;
 vm.runInNewContext(fs.readFileSync(path.join(root,'analytics-bridge.js'),'utf8'),bridge);
 listener({origin:location.origin,source:parent,data:{type:'kaemento-event',event:'view_item',params:{email:'PRIVATE',items:[{item_name:'PRIVATE'}]}}});
 assert.equal(bridge.dataLayer.at(-1)[2].items[0].item_name,'Microcemento KAEMENTO');assert.ok(!JSON.stringify(bridge.dataLayer.at(-1)).includes('PRIVATE'));
});
