// Local fixture: external tracking, messages and payment providers are blocked.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-traffic-coverage';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture');
  if(url.pathname==='/api/bold/promotion'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({state:'unknown'}));}
  if(url.pathname.startsWith('/api/')){res.writeHead(503);return res.end('{}');}
  const route=url.pathname==='/pintura-de-trafico'?'/pintura-de-trafico.html':url.pathname;
  const file=path.resolve(root,'.'+route);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const errors=[],requests=[],checks=[];
 try{
  for(const width of [320,390,768,1024,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
   await context.addInitScript(()=>{window.BoldCheckout=class{constructor(config){window.fixtureBold=config;}open(){return Promise.resolve();}};});
   await context.route('**/*',async r=>{
    const url=r.request().url();
    if(url===origin+'/api/bold/checkout'){
     const data=r.request().postDataJSON();requests.push(data);
     return r.fulfill({json:{selection:{productId:data.productId,items:data.items},amount:data.items.reduce((n,x)=>n+x.quantity,0)*108885,unitPrice:108885,currency:'COP',tax:'vat-19',orderId:'KAE-TRAFICO-1792360000000-0123456789abcdef',integritySignature:'a'.repeat(64),statusToken:'b'.repeat(64),apiKey:'fixture-only',description:'Pedido local de prueba'}});
    }
    if(url.startsWith(origin+'/'))return r.continue();
    return r.fulfill({status:200,body:'',contentType:'application/javascript'});
   });
   const page=await context.newPage();page.setDefaultTimeout(15000);console.log('Viewport',width);page.on('pageerror',e=>errors.push({width,message:e.message}));
   await page.goto(origin+'/pintura-de-trafico',{waitUntil:'networkidle'});
   console.log('Loaded',width);const preview=page.locator('[data-traffic-preview]');
   for(const color of ['amarillo','blanco','negro','azul']){
    await page.locator('.traffic-preview [data-traffic-color="'+color+'"]').click();
    assert.match(await preview.getAttribute('src'),new RegExp('parqueadero-'+color+'\\.webp$'));
    assert.equal(await page.locator('[data-traffic-form] select[name=color]').inputValue(),color);
    assert.equal(await page.locator('[data-traffic-color="'+color+'"][aria-pressed=true]').count(),2);
    await page.locator('[data-traffic-before]').click();assert.match(await preview.getAttribute('src'),/parqueadero-before/);
    await page.locator('[data-traffic-before]').click();assert.match(await preview.getAttribute('src'),new RegExp('parqueadero-'+color));
   }
   console.log('Colors passed',width);const calc=page.locator('[data-traffic-calculator]');await calc.locator('summary').click();
   const measure=color=>calc.locator('[data-coverage-color="'+color+'"]');
   const purchase=color=>page.locator('#comprar-trafico input[name="'+color+'"]');
   const apply=calc.locator('[data-coverage-apply]');
   await purchase('negro').fill('4');
   await measure('amarillo').fill('70.01');await measure('blanco').fill('140');await measure('azul').fill('70');
   assert.match(await calc.locator('[data-coverage-result=amarillo]').innerText(),/^2 galones$/);
   assert.equal(await calc.locator('[data-coverage-quote]').isVisible(),true);
   assert.match(decodeURIComponent(await calc.locator('[data-coverage-quote]').getAttribute('href')),/1 galón/);
   await apply.click();assert.equal(await purchase('amarillo').inputValue(),'2');assert.equal(await purchase('blanco').inputValue(),'2');assert.equal(await purchase('negro').inputValue(),'4');
   assert.match(await page.locator('[data-traffic-total]').innerText(),/871\.080/);
   await page.locator('[data-traffic-buy]').click();await page.locator('.kae-order-dialog').waitFor();
   assert.equal(await apply.isDisabled(),true);
   await page.getByRole('button',{name:'Cerrar datos del pedido'}).click();await page.waitForFunction(()=>!document.querySelector('[data-coverage-apply]').disabled);
   await calc.locator('[data-coverage-mode]').selectOption('area');assert.equal(await measure('amarillo').inputValue(),'');
   await measure('amarillo').fill('7');await measure('blanco').fill('7.01');await measure('negro').fill('0');
   await apply.click();assert.equal(await purchase('amarillo').inputValue(),'1');assert.equal(await purchase('blanco').inputValue(),'2');assert.equal(await purchase('negro').inputValue(),'0');
   assert.match(await page.locator('[data-traffic-total]').innerText(),/326\.655/);
   await measure('amarillo').fill('-1');assert.equal(await apply.isDisabled(),true);
   await measure('amarillo').fill('7');
   await page.locator('[data-traffic-buy]').click();
   const dialog=page.locator('.kae-order-dialog');
   for(const [name,value] of Object.entries({name:'Cliente de prueba',document:'12345678',email:'prueba@example.com',phone:'3000000000',city:'Bogotá',address:'Calle de prueba 123'}))await dialog.locator('[name="'+name+'"]').fill(value);
   await dialog.locator('[name=documentType]').selectOption('CC');await dialog.locator('[name=privacyAccepted]').check();
   await dialog.locator('button[type=submit]').click();await page.waitForFunction(()=>window.fixtureBold);
   assert.equal(await page.evaluate(()=>window.fixtureBold.amount),'326655');
   assert.deepEqual(requests.at(-1).items,[{color:'amarillo',quantity:1},{color:'blanco',quantity:2}]);
   console.log('Checkout passed',width);await page.locator('.traffic-more-uses summary').click();
   await page.evaluate(async()=>{for(const img of document.images){img.loading='eager';await img.decode().catch(()=>{});}});
   console.log('Images loaded',width);const failed=await page.locator('img').evaluateAll(images=>images.filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.src));assert.deepEqual(failed,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
   await page.locator('.traffic-preview').screenshot({path:path.join(output,'simulador-'+width+'.png')});
   await calc.screenshot({path:path.join(output,'calculador-'+width+'.png')});
   await page.screenshot({path:path.join(output,'pagina-'+width+'.png'),fullPage:true});
   await page.reload({waitUntil:'networkidle'});assert.equal(await purchase('amarillo').inputValue(),'0');assert.equal(await measure('amarillo').inputValue(),'');
   checks.push({width,simulator:true,calculator:true,checkout:'simulated',images:true,overflow:false,reloadReset:true});await context.close();
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'resultado.json'),JSON.stringify({checks,errors,simulatedCheckouts:requests.length},null,2)+'\n');console.log(JSON.stringify({checks,errors,simulatedCheckouts:requests.length},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
