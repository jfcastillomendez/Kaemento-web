// Run against the local preview, with Playwright available through NODE_PATH.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {entries} = require('../site-search.js');
const root = path.resolve(__dirname, '..');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8147';
const output = process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-search-check';
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {})});
  const context = await browser.newContext({viewport:{width:1440, height:1000}});
  // Only the campaign counter needs a local fixture; no checkout or real order is sent.
  await context.route('**/api/bold/promotion', route => route.fulfill({json:{capacity:30, remaining:24, state:'active', endsAt:'2026-10-19T00:29:14Z'}}));
  const page = await context.newPage();
  const errors = [], badAssets = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => {if (r.url().startsWith(base) && r.status() >= 400) badAssets.push([r.status(), r.url()]);});
  page.on('request', r => requests.push(r.url() + ' ' + (r.postData() || '')));
  const report = {routes:[], layouts:[], links:0, checks:[]};
  try {
    const routes = ['', 'productos', 'servicios', 'pagos'].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(name => name.endsWith('.html')).map(name => path.posix.join('/', dir, name))).filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes('<header class="nav"'));
    for (const route of routes) {
      const response = await page.goto(base + route);
      assert.equal(response.status(), 200, route);
      const trigger = page.getByRole('button', {name:'Buscar en KAEMENTO', exact:true});
      await trigger.waitFor({state:'visible'});
      assert.equal(await trigger.count(), 1);
      await trigger.click();
      await page.locator('#site-search-input').fill('manuales');
      assert.equal(await page.locator('#site-search-results a[href$=".pdf"]').count(), 2, route);
      await page.keyboard.press('Escape');
      await page.locator('#site-search').waitFor({state:'hidden'});
      report.routes.push(route);
    }
    for (const route of ['/','/productos/microcemento-kaemento.html','/servicios/microcemento-arquitectonico.html']) {
      for (const width of [1440,1280,1101,1024,768,390,320]) {
        await page.setViewportSize({width, height:width<600?844:1000});
        await page.goto(base + route);
        const trigger = page.getByRole('button', {name:'Buscar en KAEMENTO', exact:true});
        await trigger.waitFor({state:'visible'});
        await page.evaluate(() => document.fonts.ready);
        const layout = await page.evaluate(() => {
          const header = document.querySelector('header.nav');
          const elements = [...header.children].filter(el => getComputedStyle(el).display !== 'none');
          const boxes = elements.map(el => {const r=el.getBoundingClientRect();return {left:r.left, right:r.right, top:r.top, bottom:r.bottom};});
          return {overflow:document.documentElement.scrollWidth>innerWidth, outside:boxes.some(r=>r.left<0||r.right>innerWidth), overlap:boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1))};
        });
        assert.deepEqual(layout,{overflow:false,outside:false,overlap:false}, `${route} ${width}`);
        if (route === '/' && [1440,390,320].includes(width)) await page.screenshot({path:path.join(output, `inicio-${width}.png`)});
        if (width <= 1100) {
          await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
          await trigger.click();
          assert.equal(await page.locator('.menu').getAttribute('aria-expanded'), 'false');
        } else await trigger.click();
        await page.locator('#site-search-input').fill('microcemento');
        const fits = await page.locator('#site-search').evaluate(el => {const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight && el.scrollWidth<=el.clientWidth;});
        assert.ok(fits, `dialog ${width}`);
        if (route === '/' && [1440,768,390,320].includes(width)) await page.screenshot({path:path.join(output, `busqueda-${width}.png`)});
        await page.keyboard.press('Escape');
        await page.locator('#site-search').waitFor({state:'hidden'});
        assert.ok(await trigger.evaluate(el => el === document.activeElement));
        report.layouts.push({route,width,...layout});
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.goto(base + '/productos/microcemento-kaemento.html');
    const trigger = page.getByRole('button', {name:'Buscar en KAEMENTO', exact:true});
    await trigger.click();
    await page.getByRole('button',{name:'Manuales',exact:true}).click();
    assert.equal(await page.locator('#site-search-results a[href$=".pdf"]').count(), 2);
    for(let i=0;i<12;i++) {await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('#site-search')));}
    await page.getByRole('button',{name:'Borrar búsqueda'}).click();
    assert.equal(await page.locator('#site-search-input').inputValue(), '');
    await page.locator('#site-search-input').fill('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#site-search img').count(),0);
    assert.match(await page.locator('.site-search-status').textContent(), /No encontramos/);
    await page.locator('#site-search-input').fill('PersonaSintetica privacidad-prueba@example.invalid 3001234567');
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('#site-search').evaluate(el => el.open));
    const privateState = await page.evaluate(() => ({url:location.href, events:JSON.stringify(window.dataLayer), local:JSON.stringify(localStorage), session:JSON.stringify(sessionStorage)}));
    assert.doesNotMatch(JSON.stringify(privateState)+requests.join('\n'), /privacidad-prueba|3001234567|PersonaSintetica/);
    assert.equal(await page.locator('#site-search form').count(), 0);
    await page.locator('#site-search-input').fill('comprar kit');
    await page.keyboard.press('Enter');
    await page.waitForURL('**#comprar-microcemento');
    await page.locator('#site-search').waitFor({state:'hidden'});
    assert.ok(await page.locator('[data-bold-mode]').isVisible());
    assert.equal(await page.locator('[data-cart-count]').textContent(), '0 kits');
    report.checks.push('keyboard and focus return','mobile menu closes before search','suggestions and clear','safe empty results and HTML input','query absent from URL, Analytics, storage and requests','Enter opens configurator with cart unchanged');
    for (const entry of entries) {
      const response = await context.request.head(base + entry.href);
      assert.equal(response.status(),200,entry.href);
      report.links++;
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(badAssets, []);
    report.javascriptErrors = errors; report.missingAssets = badAssets;
    fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({routes:report.routes.length,responsiveChecks:report.layouts.length,validLinks:report.links,checks:report.checks,javascriptErrors:errors,missingAssets:badAssets},null,2));
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exit(1);});
