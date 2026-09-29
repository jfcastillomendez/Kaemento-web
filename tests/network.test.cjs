const {test}=require('node:test');const assert=require('node:assert/strict');const {randomBytes,randomUUID}=require('node:crypto');
const {createHandler,normalize}=require('../api/red-kaemento.js');const payments=require('../api/bold/_lib/payments.cjs');const {redisFixture}=require('./helpers/redis.cjs');
const env={KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'network-tests',KAEMENTO_EMAIL_ENABLED:'true',RESEND_API_KEY:randomBytes(32).toString('hex'),KAEMENTO_EMAIL_FROM:'KAEMENTO <pedidos@example.invalid>',KAEMENTO_SALES_EMAIL:'sales@example.invalid,admin@example.invalid'};
const application=()=>({requestId:randomUUID(),kind:'aplicadores',name:'Persona Prueba',email:'prueba@example.invalid',phone:'3001234567',city:'Bogotá',profile:'capacitacion',message:'Solicitud de prueba',privacyAccepted:true,website:'',areas:['microcemento','fachadas'],experience:'1-3'});
const partner=()=>{const {areas,experience,...data}=application();return {...data,kind:'aliados',profile:'ferreteria',business:'Establecimiento de prueba'};};
async function invoke(data,store,transport,config=env,headers={}){const out={};await createHandler(config,()=>store,transport)({method:'POST',headers:{'content-type':'application/json',origin:'https://preview.example',host:'preview.example',...headers},body:data,socket:{remoteAddress:'127.0.0.1'}},{setHeader(){},set statusCode(x){out.status=x;},end(x){out.body=JSON.parse(x);}});return out;}
test('Network forms require consent and closed choices; no arbitrary recipients or HTML',()=>{
 assert.ok(normalize(application()));assert.ok(normalize(partner()));
 for(const edit of [{privacyAccepted:false},{profile:'other'},{areas:[]},{areas:['other']},{areas:['fachadas','fachadas']},{email:'bad'},{phone:'..........'},{name:'<script>'},{website:'bot'},{to:'else@example.invalid'},{experience:'other'}])assert.equal(normalize({...application(),...edit}),null);
});
test('Email delivery is internal only; responses contain no submitted data; failures do not claim success',async()=>{
 let sent;const store={async claimNetwork(id,hash,payload){return {status:'claimed',payload:JSON.stringify(payload),leaseToken:'fixture'};},async finishNetwork(id,lease,ok){return ok?'sent':'failed';}};
 const out=await invoke(partner(),store,async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({id:'fixture'});});
 assert.equal(out.status,200);assert.deepEqual(sent.to,['sales@example.invalid','admin@example.invalid']);assert.equal(sent.reply_to,'prueba@example.invalid');assert.ok(sent.text.includes('Establecimiento de prueba'));assert.ok(!JSON.stringify(out).includes('prueba@example.invalid'));
 assert.equal((await invoke(application(),store,async()=>new Response('',{status:500}))).status,503);
 assert.equal((await invoke(application(),store,async()=>{throw new Error();},{...env,KAEMENTO_EMAIL_ENABLED:'false'})).status,503);
 assert.equal((await invoke(application(),store,null,env,{origin:'https://other.example'})).status,403);
});
test('Network Redis deduplicates, retries exact payload and limits submissions',{skip:!process.env.REDIS_SERVER_BIN},async()=>{
 const redis=await redisFixture();try{let now=Date.now(),calls=0;const store=payments.createStore(env,redis.transport,()=>now);
 const transport=async()=>{calls++;return Response.json({id:'fixture-'+calls});};
 const data=application();const results=await Promise.all(Array.from({length:5},()=>invoke(data,store,transport)));
 assert.ok(results.some(x=>x.status===200));assert.equal(calls,1);assert.equal((await invoke(data,store,transport)).status,200);assert.equal(calls,1);
 assert.equal((await invoke({...data,name:'Changed Person'},store,transport)).status,409);
 const failed=partner();assert.equal((await invoke(failed,store,async()=>new Response('',{status:503}))).status,503);
 assert.equal((await invoke(failed,store,transport)).status,200);assert.equal(calls,2);
 for(let i=0;i<3;i++)assert.equal((await invoke(application(),store,transport)).status,200);
 assert.equal((await invoke(application(),store,transport)).status,429);
 }finally{await redis.close();}
});
