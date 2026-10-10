// Isolated UI checks. All remote providers are replaced; no actual orders or conversions.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const variants=require('../bold-config.js'),{customer}=require('./helpers/orders.cjs');
const root=path.resolve(__dirname,'..'),output=process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-commercial-updates';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 let state='active';const requests=[],errors=[],missing=[];
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/api/bold/promotion'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({state,remaining:state==='sold_out'?0:21,capacity:30,endsAt:'2026-11-18T00:29:14Z'}));}
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.avif':'image/avif','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp4':'video/mp4'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400&&!r.url().includes('/api/bold/checkout'))missing.push(r.url());});
 await page.route('**/*',r=>{
  const url=r.request().url();
  if(url===origin+'/api/bold/checkout'){
   const body=r.request().postDataJSON();requests.push(body);
   if(body.expectedUnitPrice===365500)return r.fulfill({status:409,json:{code:'PRICE_CHANGED',unitPrice:430000}});
   const selection=variants.normalizeCart({items:body.items});
   return r.fulfill({json:{selection,amount:430000*variants.kitCount(selection),unitPrice:430000,currency:'COP',tax:'vat-19',orderId:'LOCAL-PRICE-FIXTURE',apiKey:'fixture',integritySignature:'a'.repeat(64),statusToken:'b'.repeat(64),description:'Local fixture'}});
  }
  if(url.startsWith(origin+'/')||/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url))return r.continue();
  return r.fulfill({status:200,body:'',contentType:'application/javascript'});
 });
 await page.addInitScript(()=>{window.__bold=[];window.BoldCheckout=class{constructor(data){this.data=data;}open(){window.__bold.push(this.data);}};});
 async function load(route){await page.goto(origin+route);await page.waitForFunction(()=>window.KaementoPromotion?.getState().state!=='unknown');}
 try{
  // Click the actual image surface, not just its title; native links work without scripted redirects.
  for(const route of ['/','/productos/index.html','/servicios/index.html']){
   await load(route);const cards=page.locator('.topic-card');assert.ok(await cards.count()>0);
   const targets=await cards.locator('.topic-link').evaluateAll(links=>links.map(a=>a.getAttribute('href')));
   for(const href of targets){const url=new URL(href,origin+route);assert.ok(fs.existsSync(path.join(root,url.pathname)));}
   const first=cards.first(),target=await first.locator('.topic-link').getAttribute('href');
   await first.scrollIntoViewIfNeeded();const box=await first.locator('img').boundingBox();
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.waitForURL(new URL(target,origin+route).href);
  }
  await load('/index.html?producto=boquilla-magica#cotizar');assert.equal(await page.locator('#quote-form select[name="servicio"]').inputValue(),'Boquilla Mágica');
  await load('/productos/microcemento-kaemento.html');
  const panel=page.locator('[data-bold-purchase]');
  await panel.locator('.kae-kit-estimate summary').click();await panel.locator('.kae-kit-estimate input').fill('26');
  assert.match(await panel.locator('.kae-kit-estimate output').innerText(),/3 kits/);assert.equal(await panel.locator('[data-cart-count]').innerText(),'0 kits');
  assert.equal(await page.locator('#detalles-tecnicos details').getAttribute('open'),null);
  await page.locator('#detalles-tecnicos summary').click();assert.ok(await page.locator('#detalles-tecnicos details').evaluate(el=>el.open));
  for(const [surface,quantity] of [['floor','1'],['walls','2']]){
   await panel.locator('[data-preview-surface="'+surface+'"]').click();
   for(const [name,value]of [['mode','standard'],['color','arena'],['sealer','mate']])await panel.locator('[data-bold-'+name+']').selectOption(value);
   await panel.locator('[data-bold-quantity]').fill(quantity);await panel.locator('[data-cart-add]').click();
  }
  const rows=panel.locator('.kae-cart-line');assert.equal(await rows.count(),2);assert.match(await rows.nth(0).innerText(),/Piso/);assert.match(await rows.nth(1).innerText(),/Muros/);
  await rows.nth(0).getByRole('button',{name:/Editar/}).click();assert.equal(await panel.locator('[data-preview-surface="floor"]').getAttribute('aria-pressed'),'true');await panel.locator('[data-cart-add]').click();
  await panel.locator('[data-bold-buy]').click();
  for(const[key,value]of Object.entries(customer)){const field=page.locator('dialog [name="'+key+'"]');if(key==='privacyAccepted')await field.check();else if(key==='documentType')await field.selectOption(value);else await field.fill(value);}
  await page.locator('.kae-order-continue').click();await page.locator('.kae-order-message').filter({hasText:'El precio vigente ha cambiado'}).waitFor();
  assert.equal(requests.length,1);assert.equal(await page.evaluate(()=>window.__bold.length),0);assert.match(await page.locator('.kae-order-summary').innerText(),/1.290.000/);
  await page.screenshot({path:path.join(output,'explicit-price-review.png')});
  await page.locator('.kae-order-continue').click();await page.waitForFunction(()=>window.__bold.length===1);assert.equal(requests.length,2);assert.equal(requests[1].expectedUnitPrice,430000);
  assert.deepEqual(requests[1].items.map(x=>x.surface),['floor','walls']);
  state='sold_out';
  for(const route of ['/','/productos/microcemento-kaemento.html','/servicios/microcemento-arquitectonico.html']){
   await load(route);await page.waitForFunction(()=>document.body.classList.contains('kae-regular-sale'));
   assert.equal(await page.locator('.campaign-art:visible').count(),0);
   for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+route+' '+width);}
   if(await page.locator('[data-bold-unit]').count())assert.match(await page.locator('[data-bold-unit]').first().innerText(),/430.000/);
  }
  state='active';await load('/productos/microcemento-kaemento.html#vista-colores-microcemento');
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:844});
   await panel.locator('[data-color-preview]').scrollIntoViewIfNeeded();
   await panel.locator('[data-bold-mode]').selectOption('standard');
   for(const scene of ['bano','cocina','dormitorio','comedor','terraza','sala']){
    await panel.locator('[data-preview-scene]').selectOption(scene);await page.waitForFunction(()=>document.querySelector('.kae-preview-scene').getAttribute('aria-busy')==='false');
   }
   const cards=await panel.locator('[data-preview-surface]').first().boundingBox();assert.ok(cards.height<78,'compact surface control');
   await panel.locator('[data-bold-color]').scrollIntoViewIfNeeded();await panel.locator('[data-bold-color]').focus();
   await panel.locator('[data-bold-color]').selectOption('arena');await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const image=await panel.locator('.kae-preview-scene').boundingBox();
   const workspace=await panel.locator('.kae-preview-workspace').boundingBox();
   assert.ok(Math.abs(image.width-workspace.width)<1,'photo fills the whole workspace '+width);
   assert.ok(Math.abs(image.width/image.height-1.5)<.01,'photo preserves its complete 3:2 composition '+width);
   if(width<720)assert.ok(image.y>=70&&image.y+image.height<=844,'mobile image remains visible while choosing tone '+width);
   else {
    const controls=await panel.locator('.kae-preview-controls').boundingBox();
    assert.ok(controls.y>=image.y+image.height,'desktop controls sit below the full-width photo');
   }
   await panel.locator('[data-bold-sealer]').scrollIntoViewIfNeeded();await panel.locator('[data-bold-sealer]').focus();await panel.locator('[data-bold-sealer]').selectOption('brillante');
   await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   const sealed=await panel.locator('.kae-preview-scene').boundingBox();
   if(width<720)assert.ok(sealed.y>=70&&sealed.y+sealed.height<=844,'mobile image remains visible while choosing sealer '+width);
   await panel.locator('.kae-preview-jump').click();
   assert.equal(await page.evaluate(()=>document.activeElement.dataset.previewSurface),'floor');
   assert.ok((await panel.locator('.kae-preview-scene').boundingBox()).y>=70,'return to the full-width combination');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(output,'simulator-editing-'+width+'.png')});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log(JSON.stringify({status:'PASS',imageNavigation:true,productContext:true,kitEstimate:true,separateFloorWalls:true,explicitPriceReview:true,regularSaleResponsive:true,jsErrors:0,missingAssets:0,output}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
