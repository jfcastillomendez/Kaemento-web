// Isolated public UI checks: no real messages, orders, tracking or payments.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=process.env.TEST_OUTPUT_DIR||'/tmp/kaemento-commercial';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname.startsWith('/api/')){res.writeHead(503,{'Content-Type':'application/json'});return res.end('{}');}
  let route=url.pathname==='/'?'/index.html':url.pathname;if(!path.extname(route))route+='.html';
  const file=path.resolve(root,'.'+route);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--disable-gpu','--disable-dev-shm-usage'],executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],checks=[];
 try{
  for(const width of [320,390,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   await context.addInitScript(()=>{window.open=url=>{window.fixturePreparedMessage=url;return null;};});
   await context.route('**/*',r=>r.request().url().startsWith(origin+'/')&&r.request().method()==='GET'?r.continue():r.fulfill({status:200,body:'',contentType:'text/javascript'}));
   const page=await context.newPage();page.on('pageerror',e=>errors.push({width,error:e.message}));
   await page.goto(origin+'/');
   assert.equal((await page.locator('.hero a').first().innerText()).replace(/\s+/g,' '),'COMPRAR PRODUCTOS ↗');
   assert.equal(await page.locator('header.nav nav > a, header.nav nav > .nav-group').count(),5);
   assert.equal(await page.locator('header.nav a').filter({hasText:'Trabaja con'}).count(),0);
   assert.ok(await page.locator('footer a').filter({hasText:'Trabaja con'}).count());
   assert.ok(await page.locator('#proyectos').evaluate(el=>el.previousElementSibling.id==='inicio'));
   const form=page.locator('#quote-form');await form.waitFor({state:'visible'});
   assert.equal(await form.locator('.fields').first().locator('input,select,textarea').count(),4);
   assert.equal(await form.locator('details[open]').count(),0);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))console.log(await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(el=>el.scrollWidth>el.clientWidth+5).map(el=>({tag:el.tagName,cls:el.className,scroll:el.scrollWidth,client:el.clientWidth,text:el.textContent.slice(0,90)}))));
   assert.ok(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'home overflow');
   await page.locator('.hero').screenshot({path:path.join(output,'inicio-'+width+'.png')});
   await form.scrollIntoViewIfNeeded();await form.screenshot({path:path.join(output,'consulta-'+width+'.png')});
   await form.locator('[name=nombre]').fill('Prueba local');await form.locator('[name=telefono]').fill('3000000000');await form.locator('[name=ciudad]').fill('Bogotá');await form.locator('[name=descripcion]').fill('Necesito renovar mi piso');await form.locator('[name=privacidad]').check();await form.locator('button[type=submit]').click();
   const prepared=await page.evaluate(()=>window.fixturePreparedMessage);assert.match(decodeURIComponent(prepared),/Necesito renovar mi piso/);assert.ok(!decodeURIComponent(prepared).includes('Correo:'));
   if(width<1101){await page.locator('header .menu').click();assert.equal(await page.locator('header .menu').getAttribute('aria-expanded'),'true');await page.locator('header nav > .nav-group > a').filter({hasText:'Comprar productos'}).click();assert.ok(page.url().includes('/productos/index.html'));}

   await page.goto(origin+'/index.html?servicio=garajes#cotizar');await page.waitForFunction(()=>document.querySelector('#quote-form select[name=servicio]').value==='Garajes y sótanos');
   assert.match(await page.locator('[data-quote-context]').innerText(),/Garajes/);
   await page.goto(origin+'/productos/microcemento-kaemento.html');
   const panel=page.locator('[data-bold-purchase]');
   await panel.locator('[data-bold-mode]').selectOption('standard');await panel.locator('[data-bold-color]').selectOption('arena');await panel.locator('[data-bold-sealer]').selectOption('mate');await panel.locator('[data-bold-quantity]').fill('2');await panel.locator('[data-cart-add]').click();
   assert.equal(await panel.locator('[data-cart-count]').innerText(),'2 kits');
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kaemento-microcemento-cart-v1')));assert.deepEqual(Object.keys(saved).sort(),['expiresAt','items','version']);
   await page.reload();await page.waitForFunction(()=>document.querySelector('[data-cart-count]').textContent==='2 kits');
   await page.goto(origin+'/');await page.waitForFunction(()=>document.querySelector('[data-cart-count]').textContent==='2 kits');
   const shipping=page.locator('[data-shipping-product]');await shipping.locator('summary').click();await shipping.locator('input').fill('Medellín');
   const message=decodeURIComponent(await shipping.locator('[data-shipping-link]').getAttribute('href'));assert.match(message,/Medellín/);assert.match(message,/Microcemento/);assert.match(message,/2 kits/);
   await shipping.screenshot({path:path.join(output,'envio-'+width+'.png')});
   await page.goto(origin+'/productos/boquilla-magica.html');const box=page.locator('.commercial-boquilla');await box.locator('select').nth(0).selectOption({label:'Lista en cartucho'});await box.locator('select').nth(1).selectOption({label:'Gris'});await box.locator('input').fill('3');
   const query=decodeURIComponent(await box.locator('a').getAttribute('href'));assert.match(query,/cartucho/);assert.match(query,/Gris/);assert.match(query,/unidades: 3/);await box.screenshot({path:path.join(output,'boquilla-'+width+'.png')});
   assert.equal(await page.locator('.kae-access').count(),0);
   await page.goto(origin+'/pintura-de-trafico');assert.equal(await page.locator('.kae-access').count(),0);await page.locator('.commercial-shipping summary').click();await page.locator('[data-shipping-city]').fill('Cali');assert.match(decodeURIComponent(await page.locator('[data-shipping-link]').getAttribute('href')),/Cali/);
   await page.goto(origin+'/productos/index.html');assert.match(await page.locator('main').innerText(),/compra en línea/);
   assert.ok(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'catalogue overflow');
   checks.push({width,navigation:true,shortQuote:true,serviceContext:true,persistentCart:true,shipping:true,boquilla:true});await context.close();console.log('Passed',width);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'resultado-comercial.json'),JSON.stringify({checks,errors},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
