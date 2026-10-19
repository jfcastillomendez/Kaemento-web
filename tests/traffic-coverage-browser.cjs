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
  for(const width of (process.env.TEST_WIDTHS?process.env.TEST_WIDTHS.split(',').map(Number):[320,390,768,1024,1440])){
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
   const page=await context.newPage();page.setDefaultTimeout(15000);console.log('Viewport',width);page.on('pageerror',e=>{errors.push({width,message:e.message});console.error('Page error',e.message);});
   await page.goto(origin+'/pintura-de-trafico',{waitUntil:'networkidle'});
   const preview=page.locator('.traffic-preview canvas');
   await preview.waitFor({state:'visible'});console.log('Unmarked scene loaded',width);
   assert.equal(await preview.getAttribute('data-colors'),'');
   await preview.evaluate(canvas=>{window.fixtureUnmarked=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;});
   if(width===1440)await page.locator('.traffic-preview').screenshot({path:path.join(output,'sin-demarcacion.png')});
   for(const color of ['negro','amarillo','blanco','azul']){
    await page.locator('.traffic-preview [data-traffic-color="'+color+'"]').click();
    const active=(await preview.getAttribute('data-colors')).split(',');assert.ok(active.includes(color));
    if(color!=='negro')assert.ok(active.includes('negro'),'black remains selected');
    assert.equal(await page.locator('[data-traffic-color="'+color+'"][aria-pressed=true]').count(),2);
    if(color==='negro'){const changed=await preview.evaluate(canvas=>{const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=0;i<pixels.length;i++)if(pixels[i]!==window.fixtureUnmarked[i])n++;return n;});assert.ok(changed>3000,'black visibly changes the photo');if(width===1440)await page.locator('.traffic-preview').screenshot({path:path.join(output,'negro-seleccionado.png')});}
   }
   assert.equal(await page.locator('[data-traffic-form] select[name=color]').inputValue(),'varios');
   for(const scene of await page.locator('[data-traffic-scene] option').evaluateAll(options=>options.map(o=>o.value))){
    console.log('Scene',width,scene);await page.locator('[data-traffic-scene]').selectOption(scene);
    await page.waitForFunction(key=>document.querySelector('.traffic-preview canvas').dataset.scene===key,scene);
    assert.equal((await preview.getAttribute('data-colors')).split(',').length,4);
    if(width===1440)await page.locator('.traffic-preview').screenshot({path:path.join(output,'espacio-'+scene+'.png')});
   }
   await page.locator('[data-traffic-before]').click();assert.equal(await preview.getAttribute('data-colors'),'');
   await page.locator('[data-traffic-before]').click();assert.equal((await preview.getAttribute('data-colors')).split(',').length,4);
   await page.locator('.traffic-preview [data-traffic-color=azul]').click();assert.ok(!(await preview.getAttribute('data-colors')).includes('azul'));assert.ok((await preview.getAttribute('data-colors')).includes('negro'));
   console.log('Accumulated colors and scenes passed',width);
   const calc=page.locator('[data-traffic-calculator]');await calc.locator('summary').click();
   const measure=color=>calc.locator('[data-coverage-color="'+color+'"]');
   const purchase=color=>page.locator('#comprar-trafico input[name="'+color+'"]');
   const apply=calc.locator('[data-coverage-apply]');
   await purchase('negro').fill('4');
   await measure('amarillo').fill('70.01');await measure('blanco').fill('140');await measure('azul').fill('70');
   assert.match(await calc.locator('[data-coverage-result=amarillo]').innerText(),/^2 galones$/);
   await apply.click();assert.equal(await purchase('amarillo').inputValue(),'2');assert.equal(await purchase('blanco').inputValue(),'2');assert.equal(await purchase('negro').inputValue(),'4');
   assert.match(await page.locator('[data-traffic-total]').innerText(),/979\.965/);
   await page.locator('[data-traffic-buy]').click();await page.locator('.kae-order-dialog').waitFor();
   assert.equal(await apply.isDisabled(),true);
   await page.getByRole('button',{name:'Cerrar datos del pedido'}).click();try{await page.waitForFunction(()=>!document.querySelector('[data-coverage-apply]').disabled);}catch(error){console.error('Close diagnostic',await page.evaluate(()=>({dialogs:document.querySelectorAll('dialog').length,quantities:[...document.querySelectorAll('.traffic-purchase-controls input')].map(x=>({name:x.name,disabled:x.disabled,value:x.value})),measures:[...document.querySelectorAll('[data-coverage-color]')].map(x=>({value:x.value,bad:x.validity.badInput})),status:document.querySelector('[data-coverage-status]').textContent})));await page.screenshot({path:path.join(output,'close-diagnostic.png'),fullPage:true});throw error;}
   await calc.locator('[data-coverage-mode]').selectOption('area');assert.equal(await measure('amarillo').inputValue(),'');
   await measure('amarillo').fill('7');await measure('blanco').fill('7.01');await measure('negro').fill('0');await measure('azul').fill('14');
   await apply.click();assert.equal(await purchase('amarillo').inputValue(),'1');assert.equal(await purchase('blanco').inputValue(),'2');assert.equal(await purchase('negro').inputValue(),'0');
   assert.match(await page.locator('[data-traffic-total]').innerText(),/544\.425/);
   await measure('amarillo').fill('-1');assert.equal(await apply.isDisabled(),true);
   await measure('amarillo').fill('7');
   await page.locator('[data-traffic-buy]').click();
   const dialog=page.locator('.kae-order-dialog');
   for(const [name,value] of Object.entries({name:'Cliente de prueba',document:'12345678',email:'prueba@example.com',phone:'3000000000',city:'Bogotá',address:'Calle de prueba 123'}))await dialog.locator('[name="'+name+'"]').fill(value);
   await dialog.locator('[name=documentType]').selectOption('CC');await dialog.locator('[name=privacyAccepted]').check();
   await dialog.locator('button[type=submit]').click();await page.waitForFunction(()=>window.fixtureBold);
   assert.equal(await page.evaluate(()=>window.fixtureBold.amount),'544425');
   assert.deepEqual(requests.at(-1).items,[{color:'amarillo',quantity:1},{color:'azul',quantity:2},{color:'blanco',quantity:2}]);
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
