// Isolated end-to-end verification. Google/Bold/Resend requests NEVER leave this browser.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'), fs=require('node:fs'), path=require('node:path');
const {randomBytes,createHash,createHmac}=require('node:crypto');
const {redisFixture}=require('./helpers/redis.cjs');
const {customer}=require('./helpers/orders.cjs');
const payments=require('../api/bold/_lib/payments.cjs');
const {createStatus}=require('../api/bold/status.js');
const {createConversion}=require('../api/bold/conversion.js');
const root=path.resolve(__dirname,'..');
const output=process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-ads-check';
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const redis=await redisFixture();
  const env={VERCEL_ENV:'production',BOLD_CONFIRMATION_ENABLED:'true',BOLD_SECRET_KEY:randomBytes(32).toString('hex'),
    KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'local-fixture-only',BOLD_STORAGE_NAMESPACE:'browser-ads'};
  const store=()=>payments.createStore(env,redis.transport),status=createStatus(env,store),conversion=createConversion(env,store);
  const {handle}=await import('../api/bold/webhook.mjs');
  const calls=[],errors=[],network=[];let storageDown=false;
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(['/api/bold/status','/api/bold/conversion'].includes(url.pathname)) {
      let body='';for await(const chunk of req)body+=chunk;req.body=body;
      calls.push({path:url.pathname,body:JSON.parse(body)});
      if(storageDown){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{"error":"Unavailable"}');}
      return (url.pathname.endsWith('/status')?status:conversion)(req,res);
    }
    if(url.pathname==='/api/bold/promotion'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"state":"active","remaining":24,"capacity":30}');}
    const name=url.pathname==='/'?'/index.html':url.pathname==='/pagos/resultado'?'/pagos/resultado.html':url.pathname;
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let blockTag=false;
  await context.route('**/*',async route=>{
    const url=route.request().url();
    if(url.startsWith(origin+'/')) return route.continue();
    network.push(url);
    if(blockTag && url.startsWith('https://www.googletagmanager.com/gtag/js'))return route.abort();
    // Even the official tag is replaced with an empty local stub. Only the gtag queue is inspected.
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  const pages=[],orders=[];
  async function record() {
    const orderId=`KAE-MICRO-${Date.now()}-${randomBytes(8).toString('hex')}`,token=randomBytes(32).toString('hex');
    const selection={items:[{quantity:1,colorMode:'standard',color:'extra-blanco',sealer:'mate'},{quantity:2,colorMode:'standard',color:'arena',sealer:'brillante'}]};
    await store().saveOrder({...payments.orderRecord(orderId,selection,customer),statusTokenHash:createHash('sha256').update(token).digest('hex'),statusAccessUntil:Date.now()+30*86400000});
    const result={orderId,token};orders.push(result);return result;
  }
  async function webhook(order,type='SALE_APPROVED') {
    const raw=JSON.stringify({id:randomBytes(16).toString('hex'),type,data:{payment_id:'payment-'+order.orderId,metadata:{reference:order.orderId},amount:{currency:'COP',total:1096500}}});
    const response=await handle(new Request('https://fixture.invalid/api/bold/webhook',{method:'POST',body:raw,headers:{'content-type':'application/json','x-bold-signature':createHmac('sha256',env.BOLD_SECRET_KEY).update(Buffer.from(raw).toString('base64')).digest('hex')}}),env,store);
    assert.equal(response.status,200);
  }
  const url=o=>origin+'/pagos/resultado?bold-order-id='+o.orderId+'&bold-tx-status=approved';
  async function pageFor(o) {
    const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(o=>{sessionStorage.setItem('kaemento-order-access',JSON.stringify({[o.orderId]:o.token}));},o);
    return page;
  }
  async function events(page) {
    const frame=page.frames().find(f=>f.url().includes('/analytics-bridge.html'));
    return frame?frame.evaluate(()=>Array.from(window.dataLayer||[]).filter(x=>x[0]==='event'&&x[1]==='conversion').map(x=>x[2])):[];
  }
  const marker=o=>redis.command(['GET','kaemento:browser-ads:ads-conversion:'+o.orderId]);
  async function waitIssued(o) {for(let i=0;i<80;i++){if(JSON.parse(await marker(o)||'null')?.status==='issued')return;await new Promise(r=>setTimeout(r,100));}throw new Error('No authorized conversion');}
  const checks=[];
  try {
    const o=await record(),page=await pageFor(o);await page.goto(url(o));
    await page.waitForFunction(()=>document.getElementById('payment-title').textContent==='Estamos verificando tu pago');
    assert.deepEqual(await events(page),[]);assert.equal(await marker(o),null);checks.push('Approved redirect hint cannot confirm or convert a pending order');
    await webhook(o);await page.locator('#payment-refresh').click();await waitIssued(o);
    await page.waitForTimeout(200);
    assert.deepEqual(await events(page),[{send_to:'AW-18358591293/UeCLCJPZtpQdEL2-h7JE',value:1096500,currency:'COP',transaction_id:o.orderId}]);
    assert.equal(await page.locator('#payment-title').innerText(),'Pago aprobado');checks.push('Signed webhook then status consultation issues one exact-label real-total conversion');
    for(const width of [1440,768,390,320]) {await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await page.screenshot({path:path.join(output,'paid-result-320.png')});
    await page.reload();await page.waitForTimeout(900);assert.deepEqual(await events(page),[]);
    await page.goto(origin+'/');await page.goBack();await page.waitForTimeout(900);assert.deepEqual(await events(page),[]);
    await page.goForward();await page.goBack();await page.waitForTimeout(900);assert.deepEqual(await events(page),[]);
    await webhook(o);await page.reload();await page.waitForTimeout(900);assert.deepEqual(await events(page),[]);
    checks.push('Reload, Back/Forward and webhook replay do not re-emit');
    const concurrent=await record();await webhook(concurrent);
    const tabs=await Promise.all([pageFor(concurrent),pageFor(concurrent)]);
    await Promise.all(tabs.map(p=>p.goto(url(concurrent))));await waitIssued(concurrent);await page.waitForTimeout(300);
    assert.equal((await Promise.all(tabs.map(events))).flat().length,1);checks.push('Concurrent independent tabs receive one authorization total');
    for(const type of ['SALE_REJECTED','VOID_APPROVED']) {
      const denied=await record();await webhook(denied,type);const p=await pageFor(denied);await p.goto(url(denied));await p.waitForTimeout(900);
      assert.deepEqual(await events(p),[]);assert.equal(await marker(denied),null);
    }
    checks.push('Rejected and refunded orders never convert');
    const bad=await record();await webhook(bad);const p=await pageFor(bad);
    storageDown=true;await p.goto(url(bad));await p.waitForTimeout(900);assert.deepEqual(await events(p),[]);assert.equal(await marker(bad),null);await p.close();storageDown=false;
    checks.push('Backend failure cannot authorize a conversion');
    const blocked=await record();await webhook(blocked);blockTag=true;const blockedPage=await pageFor(blocked);await blockedPage.goto(url(blocked));await blockedPage.waitForTimeout(16000);
    assert.equal(await marker(blocked),null);assert.deepEqual(await events(blockedPage),[]);blockTag=false;
    checks.push('Blocked Google tag leaves authorization unconsumed');
    const spoof=await record(),sp=await pageFor(spoof);await sp.goto(url(spoof));
    await sp.evaluate(o=>{
      window.kaementoTrack('conversion',{value:1096500,transaction_id:o.orderId,currency:'COP'});
      const iframe=document.querySelector('iframe[src^="/analytics-bridge.html"]');
      iframe.contentWindow.postMessage({type:'kaemento-ads-purchase',orderId:o.orderId,ticket:'f'.repeat(64),paid:true,value:1096500},location.origin);
    },spoof);await sp.waitForTimeout(900);assert.deepEqual(await events(sp),[]);assert.equal(await marker(spoof),null);
    checks.push('Generic tracking and forged purchase messages cannot bypass backend confirmation');
    const landing=await context.newPage();await landing.goto(origin+'/?gclid=SYNTHETIC_CLICK_ID_NOT_SENT&email=PRIVATE@example.invalid&bold-order-id=PRIVATE');
    const src=await landing.locator('iframe[src^="/analytics-bridge.html"]').getAttribute('src');assert.equal(src,'/analytics-bridge.html?gclid=SYNTHETIC_CLICK_ID_NOT_SENT');
    const frame=landing.frames().find(f=>f.url().includes('/analytics-bridge.html'));
    const ads=await frame.evaluate(()=>Array.from(dataLayer).find(x=>x[0]==='config'&&x[1]==='AW-18358591293')[2]);
    assert.equal(ads.page_location,'https://www.kaemento.com/?gclid=SYNTHETIC_CLICK_ID_NOT_SENT');
    assert.equal(await frame.locator('script[src^="https://www.googletagmanager.com/gtag/js"]').count(),1);
    checks.push('One existing Google tag; sanitized click attribution excludes arbitrary query/PII');
    const privateValues=[customer.email,customer.document,customer.phone,customer.address,...orders.map(o=>o.token)];
    for(const req of network)for(const privateValue of privateValues)assert.ok(!req.includes(privateValue));
    for(const p of pages.filter(p=>!p.isClosed())) {
      const f=p.frames().find(f=>f.url().includes('/analytics-bridge.html'));
      if(f){const queue=await f.evaluate(()=>JSON.stringify(dataLayer));for(const value of privateValues)assert.ok(!queue.includes(value));}
    }
    assert.deepEqual(errors,[]);
    const report={checks,externalRequestsActuallySent:0,googleConversionRequestsSent:0,productionOrdersCreated:0,consoleErrors:errors};
    fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } finally {await browser.close();await new Promise(r=>server.close(r));await redis.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
