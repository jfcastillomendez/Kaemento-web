// Opt-in browser integration: real local Redis + real checkout handler; no real payment or email.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to existing local installations.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {redisFixture}=require('./helpers/redis.cjs');
const {customer}=require('./helpers/orders.cjs');
const {createCheckout}=require('../api/bold/checkout.js');
const payments=require('../api/bold/_lib/payments.cjs');
const emails=require('../api/bold/_lib/order-emails.cjs');
const root=path.resolve(__dirname,'..'),output=process.env.ORDER_TEST_OUTPUT || path.join(require('node:os').tmpdir(),'kaemento-order-browser');
const env={BOLD_CONFIRMATION_ENABLED:'true',BOLD_IDENTITY_KEY:randomBytes(16).toString('hex'),BOLD_SECRET_KEY:randomBytes(32).toString('hex'),
  UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:randomBytes(16).toString('hex'),BOLD_STORAGE_NAMESPACE:'browser-tests'};
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.avif':'image/avif','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.pdf':'application/pdf','.mp4':'video/mp4'};
(async()=>{
  fs.mkdirSync(output,{recursive:true}); const redis=await redisFixture(),store=payments.createStore(env,redis.transport);
  let requests=0,lastOrder;
  const checkout=createCheckout(env,()=>({...store,async saveOrder(order){await store.saveOrder(order);lastOrder=order.orderId;}}));
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/bold/checkout'){let raw='';for await(const chunk of req)raw+=chunk;req.body=raw;requests++;return checkout(req,res);}
    let name=url.pathname==='/'?'/index.html':url.pathname==='/pagos/resultado'?'/pagos/resultado.html':decodeURIComponent(url.pathname);
    const file=path.resolve(root,'.'+name);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
  const results=[];
  try {
    for(const width of [1440,1024,768,390,320])for(const route of ['/','/productos/microcemento-kaemento.html']) {
      const context=await browser.newContext({viewport:{width,height:width<500?844:1000}}),page=await context.newPage(),errors=[],missing=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});
      await page.route('**/*',r=>(r.request().url().startsWith(origin)||/^https:\/\/(fonts.googleapis.com|fonts.gstatic.com)\//.test(r.request().url()))?r.continue():r.fulfill({status:200,body:'',contentType:'text/plain'}));
      await page.addInitScript(()=>{window.__bold=[];window.BoldCheckout=class{constructor(config){this.config=config;}async open(){window.__bold.push(this.config);}};});
      await page.goto(origin+route,{waitUntil:'networkidle'});
      const panel=page.locator('[data-bold-purchase]').first();await panel.scrollIntoViewIfNeeded();
      await panel.locator('[data-bold-mode]').selectOption('standard');await panel.locator('[data-bold-color]').selectOption('arena');await panel.locator('[data-bold-sealer]').selectOption('mate');
      const baselineWidth = await page.evaluate(()=>document.documentElement.scrollWidth);
      await panel.locator('[data-bold-buy]').click();await page.locator('dialog[open]').waitFor();
      await page.screenshot({path:path.join(output,`${route==='/'?'home':'producto'}-${width}.png`)});
      const before=requests;await page.locator('.kae-order-continue').click();assert.equal(requests,before,'required fields prevent checkout');
      const geometry=await page.evaluate(()=>{const d=document.querySelector('dialog');return {page:document.documentElement.scrollWidth<=innerWidth+1,dialog:d.scrollWidth<=d.clientWidth+1,rect:d.getBoundingClientRect().toJSON()};});
      const overflow = await page.evaluate(()=>({width:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).visibility!=='hidden').slice(0,10).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))}));
      assert.ok(geometry.page&&geometry.dialog,JSON.stringify({route,width,baselineWidth,geometry,overflow}));assert.ok(geometry.rect.x>=0&&geometry.rect.right<=width);
      if(width>=768)await page.keyboard.press('Escape');else await page.locator('.kae-order-close').click();
      assert.equal(await page.locator('dialog').count(),0);await panel.locator('[data-bold-buy]').click();
      for(const [key,value] of Object.entries(customer)) {
        const field=page.locator(`dialog [name="${key}"]`);
        if(key==='privacyAccepted')await field.check();else if(key==='documentType')await field.selectOption(value);else await field.fill(value);
      }
      await page.locator('.kae-order-continue').dblclick();
      await page.waitForFunction(()=>window.__bold.length===1);
      assert.equal(requests,before+1);assert.equal(await page.locator('dialog').count(),0);
      const saved=await store.readOrder(lastOrder);assert.equal(saved.customerEmail,customer.email);assert.equal(saved.paymentStatus,'pending');
      const client=await page.evaluate(()=>({bold:window.__bold,events:window.dataLayer,session:JSON.stringify(sessionStorage),local:JSON.stringify(localStorage)}));
      const active=client.events.filter(e=>e.event==='begin_checkout');assert.equal(active.length,1);assert.equal(active[0].value,365500);
      for(const value of [customer.email,customer.document,customer.phone,customer.address,customer.name])assert.ok(!JSON.stringify(client).includes(value));
      assert.equal(client.bold[0].orderId,lastOrder);assert.equal(client.bold[0].description,'Microcemento KAEMENTO | Arena | Mate | 1 kit');
      assert.ok(!client.events.some(e=>e.event==='purchase'||e.event==='generate_lead'));
      assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
      results.push({route,width,requiredFields:true,cancel:true,singleCheckout:true,persistentOrder:true,analyticsNoPII:true,overflow:false,jsErrors:0,missingAssets:0});
      await context.close();
    }
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('**/*',r=>(r.request().url().startsWith(origin)||/^https:\/\/(fonts.googleapis.com|fonts.gstatic.com)\//.test(r.request().url()))?r.continue():r.fulfill({status:200,body:''}));
    await page.addInitScript(()=>{window.__bold=[];window.BoldCheckout=class{constructor(config){this.config=config;}open(){window.__bold.push(this.config);}};});
    await page.goto(origin+'/productos/microcemento-kaemento.html',{waitUntil:'networkidle'});
    const panel=page.locator('[data-bold-purchase]');
    await panel.locator('[data-bold-mode]').selectOption('mix');await panel.locator('[data-bold-tone1]').selectOption('arena');
    assert.equal(await panel.locator('[data-bold-tone2] option[value="arena"]').evaluate(option=>option.disabled),true);
    await panel.locator('[data-bold-tone2]').selectOption('gris-cemento');await panel.locator('[data-bold-ratio]').selectOption('40');
    await panel.locator('[data-bold-sealer]').selectOption('brillante');await panel.locator('[data-bold-quantity]').fill('3');
    await panel.locator('[data-bold-buy]').click();
    for(const [key,value]of Object.entries(customer)){const el=page.locator(`dialog [name="${key}"]`);if(key==='privacyAccepted')await el.check();else if(key==='documentType')await el.selectOption(value);else await el.fill(value);}
    await page.locator('.kae-order-continue').click();await page.waitForFunction(()=>window.__bold.length===1);
    const order=await store.readOrder(lastOrder);assert.equal(order.total,1096500);assert.equal(order.color1Percentage,40);assert.equal(order.color2Percentage,60);
    assert.equal(order.sealer,'brillante');
    const event={id:randomBytes(16).toString('hex'),type:'SALE_APPROVED',paymentId:'browser-payment',orderId:order.orderId,amount:order.total,currency:'COP',paymentMethod:'PSE'};
    assert.equal(await store.process(event),'confirmed');const paid=await store.readOrder(order.orderId);
    for(const role of ['sales','customer'])fs.writeFileSync(path.join(output,`email-${role}.html`),emails.emailContent(paid,role).html);
    const mailEnv={...env,KAEMENTO_EMAIL_ENABLED:'true',RESEND_API_KEY:randomBytes(32).toString('hex'),KAEMENTO_EMAIL_FROM:'KAEMENTO <pedidos@example.invalid>',KAEMENTO_SALES_EMAIL:'ventas@example.invalid,admin@example.invalid'};
    const sent=[];await emails.deliverOrder(order.orderId,store,mailEnv,async(_url,options)=>{sent.push(JSON.parse(options.body));return Response.json({id:randomBytes(16).toString('hex')});});
    assert.equal(sent.length,2);assert.equal((await store.readOrder(order.orderId)).emailStatus,'sent');
    results.push({scenario:'3 kits / 40% Arena + 60% Gris Cemento / Brillante',total:1096500,paid:true,simulatedEmails:2});
    // Returning from Bold must not create a purchase event or confirm an unverified payment.
    await page.goto(origin+'/pagos/resultado?bold-order-id='+order.orderId+'&bold-tx-status=approved');
    assert.ok(!(await page.evaluate(()=>window.dataLayer||[])).some(e=>e.event==='purchase'));
    for(const width of [1440,768,390,320]) {
      await page.setViewportSize({width,height:900});
      for(const role of ['sales','customer']){await page.setContent(emails.emailContent(paid,role).html);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,`email-${role}-${width}.png`),fullPage:true});}
    }
    fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({status:'PASS',responsiveFlows:10,mixedFlow:true,emailPreviews:8,output}));
  } finally {await browser.close();await new Promise(r=>server.close(r));await redis.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
