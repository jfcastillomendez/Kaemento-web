const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const campaign=require('../microcemento-launch-config.js');
function fixture(now){
 const block={hidden:false},price={textContent:''};let subscriber;
 const window={KaementoLaunchCampaign:campaign,KaementoPromotion:{subscribe(fn){subscriber=fn;}}};
 const document={querySelectorAll(selector){return selector==='[data-launch-block]'?[block]:selector==='[data-launch-price]'?[price]:[];}};
 vm.runInNewContext(fs.readFileSync('microcemento-launch.js','utf8'),{window,document,Intl,Date:class extends Date{static now(){return Date.parse(now);}}});
 return {block,price,notify:data=>subscriber(data)};
}
test('Public discount requires live confirmation and disappears on failed or ended availability',()=>{
 const f=fixture('2026-11-10T12:00:00Z');
 assert.equal(f.block.hidden,true);assert.match(f.price.textContent,/430.000/);
 f.notify({state:'active'});assert.equal(f.block.hidden,false);assert.match(f.price.textContent,/365.500/);
 for(const state of ['unknown','ended','sold_out','upcoming']){
  f.notify({state});assert.equal(f.block.hidden,true);assert.match(f.price.textContent,/430.000/);
 }
});
test('Expired campaign cannot reappear from a stale active response',()=>{
 const f=fixture('2026-11-19T12:00:00Z');f.notify({state:'active'});
 assert.equal(f.block.hidden,true);assert.match(f.price.textContent,/430.000/);
});
test('Current static price and structured offer agree before scripts or search indexing',()=>{
 for(const file of ['index.html','productos/microcemento-kaemento.html']){
  const html=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(html,/\$365\.500/);assert.match(html,/data-bold-unit>\$430\.000/);
  if(file.startsWith('productos/')){
   const graph=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
   const product=graph['@graph'].find(item=>item['@type']==='Product');
   assert.equal(Number(product.offers.price),430000);
   assert.match(html,/id="micro-hero-comprar"/);
  }
 }
});
