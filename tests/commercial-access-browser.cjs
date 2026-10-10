// Isolated browser fixture: never sends events, orders or payments to external services.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname,'..');
const output = process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-discovery';
fs.mkdirSync(output,{recursive:true});
(async () => {
  let state = 'active', remaining = 24;
  const endsAt = new Date(Date.now()+86400000).toISOString();
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://fixture');
    if (url.pathname === '/api/bold/promotion') {
      res.writeHead(state === 'unknown' ? 503 : 200,{'Content-Type':'application/json'});
      return res.end(JSON.stringify({state,remaining,capacity:30,endsAt}));
    }
    const file = path.resolve(root,'.'+(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end();}
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)] || 'application/octet-stream'});
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const errors = [], missing = [], requests = [], checks = [];
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(origin) && r.status()>=400 && !r.url().endsWith('/api/bold/promotion')) missing.push(r.url());});
  page.on('request',r=>{if(r.url().startsWith(origin+'/api/')) requests.push(new URL(r.url()).pathname);});
  await page.route('**/*',route=>{
    const url = route.request().url();
    if (url.startsWith(origin+'/') || /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.continue();
    return route.fulfill({status:200,contentType:'application/javascript',body:''});
  });
  const settle = () => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const events = name => page.evaluate(name=>(window.dataLayer || []).filter(e=>e.event === name).length,name);
  const visibleBar = () => page.locator('.kae-access').evaluate(el=>getComputedStyle(el).visibility === 'visible');
  async function load(route='/') {
    await page.goto(origin+route,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.kae-access')?.dataset.state !== undefined);
    await page.waitForFunction(state=>document.querySelector('.kae-access')?.dataset.state === state,state);
    await page.evaluate(()=>document.fonts.ready);await settle();
  }
  try {
    await load();
    assert.equal(await events('view_promotion'),1);
    assert.equal(await events('microcemento_simulator_start'),0);
    for (const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:1000});await settle();
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settle();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'entry overflow '+width);
      const bar = await page.locator('.kae-access').boundingBox();
      const nav = await page.locator('header.nav').boundingBox();
      if (width>900) assert.ok(Math.abs(bar.y-nav.height)<2,'bar below header');
      else {
        assert.ok(Math.abs(bar.y+bar.height-1000)<2,'bar at bottom');
        const whatsapp = await page.locator('.whatsapp').boundingBox();
        if(whatsapp) assert.ok(whatsapp.y+whatsapp.height<=bar.y,'WhatsApp clears shortcuts');
      }
      if ([1440,390,320].includes(width)) await page.screenshot({path:path.join(output,'entry-'+width+'.png')});
      await page.locator('#discovery-promotion').click();await settle();
      const section = await page.locator('#lanzamiento-microcemento').boundingBox();
      assert.ok(section.y>=nav.height,'offer clears header');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'offer overflow '+width);
      await page.screenshot({path:path.join(output,'discovery-'+width+'.png')});
      if(width<=900){
        await page.locator('#launch-home-simulator').scrollIntoViewIfNeeded();await settle();
        await page.waitForFunction(()=>document.body.classList.contains('kae-discovery-visual-active'));
        assert.equal(await page.locator('.whatsapp').isVisible(),false,'WhatsApp clears the image button');
        await page.screenshot({path:path.join(output,'tonality-cta-'+width+'.png')});
      }
      checks.push({width,overflow:false,shortcutsVisible:true});
    }
    await page.setViewportSize({width:1440,height:1000});
    const visual = page.locator('.kae-discovery-visual');
    await visual.scrollIntoViewIfNeeded();
    assert.equal(await visual.locator('canvas,button').count(),0);
    assert.equal(await visual.locator('img').getAttribute('src'),'/assets/microcemento/visualizador/sala-base.webp');
    const cta = page.locator('#launch-home-simulator');
    assert.match(await cta.innerText(),/PRUEBA TU TONALIDAD/);
    assert.match(await page.locator('#discovery-simulator').innerText(),/Prueba tu tonalidad/);
    assert.equal(await page.locator('[data-cart-count]').innerText(),'0 kits');
    await cta.click();await settle();
    assert.equal(await events('microcemento_simulator_open'),1);
    assert.equal(await events('microcemento_simulator_start'),0);
    assert.equal(await events('view_promotion'),1);
    assert.ok((await page.locator('#vista-colores-microcemento').boundingBox()).y>=130);
    assert.match(await page.locator('[data-discovery-offer]').innerText(),/15%.*365.500/);
    await page.locator('[data-bold-mode]').selectOption('standard');
    await page.locator('[data-bold-color]').focus();await page.keyboard.press('a');await settle();
    assert.equal(await events('microcemento_simulator_start'),1);
    await page.keyboard.press('g');await settle();
    assert.equal(await events('microcemento_simulator_start'),1);
    checks.push({staticImageAndTonalityCTA:true,measurementSeparatesOpenAndUse:true,promotionViewDeduplicated:true});

    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-bold-quantity]').focus();await settle();assert.equal(await visibleBar(),false,'keyboard clears shortcuts');
    await page.locator('[data-bold-quantity]').evaluate(el=>el.blur());
    await page.locator('.kae-cart').scrollIntoViewIfNeeded();await settle();
    await page.waitForFunction(()=>document.body.classList.contains('kae-discovery-cart'));
    assert.equal(await visibleBar(),false,'cart clears shortcuts');
    await page.evaluate(()=>{document.activeElement.blur();scrollTo({top:0,behavior:'instant'});});await settle();
    await page.waitForFunction(()=>!document.body.classList.contains('kae-discovery-cart'));
    assert.equal(await visibleBar(),true);
    await page.locator('header.nav button.menu').click();await settle();assert.equal(await visibleBar(),false);
    await page.locator('header.nav button.menu').click();await settle();assert.equal(await visibleBar(),true);
    checks.push({mobileKeyboardCartAndMenuClear:true});

    for (const route of ['/servicios/microcemento-arquitectonico.html','/galeria.html','/productos/boquilla-magica.html']) {
      await load(route);assert.equal(await visibleBar(),true);
      assert.equal(await page.locator('#discovery-simulator').getAttribute('href'),'/productos/microcemento-kaemento.html#vista-colores-microcemento');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('#discovery-simulator').click();await page.waitForURL('**/productos/microcemento-kaemento.html#vista-colores-microcemento');
    await page.locator('#vista-colores-microcemento').waitFor();await settle();
    const anchor = await page.locator('#vista-colores-microcemento').boundingBox();
    assert.ok(anchor.y>=74 && anchor.y<300,'cross-page simulator shortcut lands visibly: '+anchor.y);
    await page.setViewportSize({width:1440,height:1000});await load('/productos/microcemento-kaemento.html#lanzamiento-microcemento');
    assert.ok((await page.locator('#lanzamiento-microcemento').boundingBox()).y>=82,'cross-page offer clears nav');
    await page.screenshot({path:path.join(output,'product-entry.png')});
    checks.push({subpageAccess:true,crossPageAnchors:true});

    for (const next of ['ended','sold_out','upcoming','unknown']) {
      state=next;remaining=next==='sold_out'?0:24;await load();
      assert.ok(!(await page.locator('[data-discovery-label]').innerText()).includes('15%'));
      assert.equal(await page.locator('[data-discovery-live]:visible').count(),0);
      assert.equal(await events('view_promotion'),0);
      await page.locator('#discovery-promotion').click();await page.locator('[data-discovery-buy]').click();await settle();
      assert.equal(await events('select_promotion'),0);
      assert.equal(await events('view_promotion'),0);
      checks.push({state:next,noActiveDiscountClaim:true,noPromotionEvent:true});
    }
    await page.goto(origin+'/pagos/resultado.html',{waitUntil:'load'});
    assert.equal(await page.locator('.kae-access').count(),0);
    assert.equal(await page.locator('script[data-kae-discovery]').count(),0);
    assert.deepEqual([...new Set(requests)],['/api/bold/promotion']);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    checks.push({paymentPageUnchanged:true,externalConversions:0});
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({status:'PASS',checks,jsErrors:errors,missingAssets:missing},null,2));
    console.log(JSON.stringify({status:'PASS',checks:checks.length,output}));
  } catch (error) {
    await page.screenshot({path:path.join(output,'failure.png')});throw error;
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
