const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const variants=require('../bold-config.js'),key='kaemento-microcemento-cart-v1';
const item={colorMode:'standard',color:'arena',quantity:2,sealer:'mate'},selection=variants.restore({items:[item]});
async function fixture(paymentStatus,draft=selection,hint='approved'){
 const id='KAE-MICRO-1792360000000-0123456789abcdef',store=new Map([[key,JSON.stringify({version:2,expiresAt:Date.now()+10000,items:draft.items})]]),nodes=new Map();
 const node=()=>({textContent:'',hidden:false,addEventListener(){},setAttribute(){},removeAttribute(){},replaceChildren(){},append(){}});
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,addEventListener(){},hidden:true};
 const session={'kaemento-order-access':JSON.stringify({[id]:'a'.repeat(64)})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../pagos/resultado.js'),'utf8'),{
  window:{KaementoBoldConfig:variants,addEventListener(){}},document,location:{search:'?bold-order-id='+id+'&bold-tx-status='+hint},
  localStorage:{getItem:k=>store.get(k),removeItem:k=>store.delete(k)},sessionStorage:{getItem:k=>session[k]},URLSearchParams,Intl,AbortSignal,console,clearTimeout(){},setTimeout(){},
  fetch:async()=>({ok:true,json:async()=>({orderId:id,selection,currency:'COP',amount:731000,paymentStatus})})
 });
 await new Promise(r=>setImmediate(r));return {store,nodes};
}
test('Only a server-confirmed paid order removes its matching product cart',async()=>{
 const f=await fixture('paid');assert.ok(!f.store.has(key));assert.equal(f.nodes.get('payment-title').textContent,'Pago aprobado');
});
test('Redirect approval hint, pending and failed states cannot discard a cart',async()=>{
 for(const status of ['pending','failed','refunded'])assert.ok((await fixture(status)).store.has(key));
});
test('A paid earlier order cannot discard a different current cart',async()=>{
 const other=variants.restore({items:[{...item,color:'negro'}]});assert.ok((await fixture('paid',other)).store.has(key));
});
