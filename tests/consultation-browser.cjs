// Isolated browser regression: no WhatsApp messages, payments or analytics leave the fixture.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),key='kaemento-whatsapp-consultation-v1';
const output=process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-consultation';
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/api/bold/promotion') {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({state:'active',remaining:21,capacity:30,endsAt:'2026-11-18T00:29:14Z'}));}
    if(req.method!=='GET' || url.pathname.startsWith('/api/')) {res.writeHead(503);return res.end();}
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const errors=[],checks=[];
  try {
    for(const route of ['/','/productos/microcemento-kaemento.html']) {
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.route('**/*',r=>{
        const url=r.request().url();
        if(url.startsWith(origin+'/') || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url))return r.continue();
        return r.fulfill({status:200,body:url.startsWith('https://wa.me/')?'<title>WhatsApp local fixture</title><p>Mensaje no enviado.</p>':'',contentType:url.startsWith('https://wa.me/')?'text/html':'application/javascript'});
      });
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.evaluate(()=>document.fonts.ready);
      const panel=page.locator('[data-bold-purchase]'),area=panel.locator('[data-preview-area]'),quantity=panel.locator('[data-bold-quantity]');
      const select=(name,value)=>panel.locator('[data-bold-'+name+']').selectOption(value);
      const surface=name=>panel.locator('[data-preview-surface="'+name+'"]');
      const summary=panel.locator('.kae-area-calculator summary'),link=panel.locator('.kae-application-consultation a');
      await summary.click();
      for(const [value,expected] of [['0.01','1'],['10','1'],['10.01','2'],['26','3'],['200','20'],['200.01',''],['0',''],['-1',''],['','']]) {
        await area.fill(value);assert.equal(await quantity.inputValue(),expected,'area '+value);
      }
      await area.pressSequentially('10.01');assert.equal(await area.inputValue(),'10.01');assert.equal(await quantity.inputValue(),'2','decimal typing is not interrupted by re-render');
      await area.fill('26');await select('mode','mix');await select('tone1','arena');await select('tone2','gris-cemento');await select('ratio','70');await select('sealer','brillante');
      await summary.click();
      await surface('walls').click();assert.equal(await quantity.inputValue(),'');await summary.click();assert.equal(await area.inputValue(),'');
      await area.fill('12');await select('mode','standard');await select('color','extra-blanco');await select('sealer','mate');
      await quantity.fill('4');assert.match(await panel.locator('[data-area-result]').innerText(),/2 kits sugeridos/,'manual override remains possible');
      assert.match(await panel.locator('[data-area-result]').innerText(),/Cantidad elegida: 4 kits/);
      assert.match(await panel.locator('.kae-quantity-reference').innerText(),/ajustada manualmente/);
      assert.equal(await summary.innerText(),'Área de muros · 12 m²');
      assert.equal(await panel.locator('.kae-area-calculator').count(),1);
      assert.equal(await panel.locator('.kae-kit-estimate').count(),0);
      await summary.click();await panel.locator('[data-preview-scene]').selectOption('cocina');
      await surface('floor').click();assert.equal(await quantity.inputValue(),'3');assert.equal(await area.inputValue(),'26');
      await panel.locator('[data-cart-add]').click();assert.equal(await quantity.inputValue(),'');assert.equal(await area.inputValue(),'');
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'3 kits');
      await surface('walls').click();assert.equal(await quantity.inputValue(),'4');assert.equal(await area.inputValue(),'12');
      const url=new URL(await link.getAttribute('href')),message=url.searchParams.get('text');
      assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/573003671548');
      for(const text of ['material + aplicación','Microcemento KAEMENTO','Arena 70% + Gris Cemento 30%','Brillante','3 kits','Área de referencia: 26 m²','Extra Blanco','Mate','Cantidad elegida: 4 kits','Área: 12 m²'])assert.ok(message.includes(text),text);
      const popupPromise=context.waitForEvent('page');await link.click();const popup=await popupPromise;await popup.waitForLoadState();
      assert.equal((await popup.url()).split('?')[0],'https://wa.me/573003671548');
      await popup.close();await page.bringToFront();
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'3 kits');assert.equal(await quantity.inputValue(),'4');
      checks.push({route,scenario:'new-tab WhatsApp returns with cart, both surfaces, area and quantities'});
      // Some mobile clients use this tab: exercise an actual navigation and Back.
      await link.evaluate(el=>el.target='_self');await link.click();await page.waitForURL('https://wa.me/**');
      await page.goBack({waitUntil:'domcontentloaded'});await panel.locator('[data-preview-scene]').waitFor();
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'3 kits');assert.equal(await quantity.inputValue(),'4');
      assert.equal(await area.inputValue(),'12');assert.equal(await panel.locator('[data-preview-scene]').inputValue(),'cocina');
      assert.match(await surface('floor').innerText(),/70%/);assert.match(await surface('walls').innerText(),/Extra Blanco/);
      assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),key),null,'return consumes the ticket');
      checks.push({route,scenario:'same-tab Back restores exact selection once'});
      for(const width of [1440,1024,768,390,320]) {
        await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        if (!(await area.isVisible())) await summary.click();assert.ok(await area.isVisible(),'calculator '+route+' '+width);
        const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
        if(!fits){console.log(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,100),right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width}))})));await page.screenshot({path:path.join(output,'overflow-'+width+'.png')});}
        assert.ok(fits,'overflow '+route+' '+width);
        await area.fill('26');assert.equal(await quantity.inputValue(),'3');
        await summary.click();
        assert.ok(await link.isVisible());checks.push({route,width,scenario:'responsive calculator and consultation'});
      }
      // The consultation must not turn into a permanent cart.
      await page.reload({waitUntil:'domcontentloaded'});assert.equal(await panel.locator('[data-cart-count]').innerText(),'0 kits');assert.equal(await quantity.inputValue(),'');
      await select('mode','standard');await select('color','arena');await select('sealer','mate');await quantity.fill('1');await panel.locator('[data-cart-add]').click();
      await page.goto(origin+'/servicios/index.html',{waitUntil:'domcontentloaded'});await page.goBack({waitUntil:'domcontentloaded'});
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'0 kits');
      checks.push({route,scenario:'normal reload and navigation still clear cart'});
      await page.evaluate(k=>sessionStorage.setItem(k,JSON.stringify({version:1,path:location.pathname,expiresAt:Date.now()-1,panels:[{cart:{items:[{quantity:1,colorMode:'standard',color:'arena',sealer:'mate'}]}}]})),key);
      await page.reload({waitUntil:'domcontentloaded'});assert.equal(await panel.locator('[data-cart-count]').innerText(),'0 kits');assert.equal(await page.evaluate(k=>sessionStorage.getItem(k),key),null);
      // Storage unavailable: the native new-tab path keeps the current document usable.
      await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('Blocked storage fixture');};});
      await select('mode','standard');await select('color','arena');await select('sealer','mate');await quantity.fill('1');await panel.locator('[data-cart-add]').click();
      const blockedPopup=context.waitForEvent('page');await link.click();const blocked=await blockedPopup;await blocked.close();
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'1 kit');
      await context.close();
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'consultation-checks.json'),JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({status:'PASS',checks:checks.length,externalMessages:0,errors}));
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
