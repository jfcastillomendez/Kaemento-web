// Local fixture only: external analytics, payments and emails never receive test requests.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const config=require('../bold-config.js');
const preview=require('../microcemento-preview-render.js');
const {customer}=require('./helpers/orders.cjs');
const root=path.resolve(__dirname,'..');
const output=process.env.TEST_OUTPUT_DIR || '/tmp/kaemento-color-preview';
fs.mkdirSync(output,{recursive:true});
(async()=>{
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname==='/api/bold/promotion') {res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"state":"active","remaining":24,"capacity":30,"endsAt":"2026-11-18T00:29:14Z"}');}
    const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end('Not found');}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.avif':'image/avif','.mp4':'video/mp4'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const checks=[],errors=[],missing=[],requests=[];
  try {
    for(const route of ['/','/productos/microcemento-kaemento.html']) {
      const page=await browser.newPage({viewport:{width:1440,height:1000}});
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.url().startsWith(origin)&&r.status()>=400)missing.push(r.url());});
      await page.route('**/*',r=>{
        const url=r.request().url();
        if(url===origin+'/api/bold/checkout'){
          const body=r.request().postDataJSON();requests.push(body);
          const selection=config.normalizeCart({items:body.items});assert.ok(selection);
          return r.fulfill({json:{amount:config.kitCount(selection)*config.unitPrice,currency:'COP',tax:'vat-19',selection,
            orderId:'LOCAL-COLOR-FIXTURE',apiKey:'fixture-public',integritySignature:'a'.repeat(64),statusToken:'b'.repeat(64),description:'Local fixture only'}});
        }
        if(url.startsWith(origin+'/')||/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url))return r.continue();
        return r.fulfill({status:200,body:'',contentType:'application/javascript'});
      });
      await page.addInitScript(()=>{
        window.__bold=[];
        window.BoldCheckout=class {constructor(value){this.value=value;}open(){window.__bold.push(this.value);}};
      });
      await page.goto(origin+route,{waitUntil:'domcontentloaded'});
      const panel=page.locator('[data-bold-purchase]');
      await panel.locator('[data-color-preview]').scrollIntoViewIfNeeded();
      await page.evaluate(()=>document.fonts.ready);
      await page.waitForFunction(()=>document.querySelector('[data-color-preview] img').naturalWidth===1536);
      const tick=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      const select=(name,value)=>panel.locator('[data-bold-'+name+']').selectOption(value);
      const surface=name=>panel.locator('[data-preview-surface="'+name+'"]');
      assert.equal(await panel.locator('[data-preview-surface]').first().getAttribute('data-preview-surface'),'floor');
      assert.equal(await surface('floor').getAttribute('aria-pressed'),'true');
      assert.ok((await surface('floor').boundingBox()).y < (await panel.locator('.kae-preview-scene').boundingBox()).y);
      await surface('walls').click();
      async function pixels(original=false){
        return page.evaluate(original=>{
          const frame=document.querySelector('[data-color-preview]');
          let canvas=frame.querySelector('canvas');
          if(original){canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;canvas.getContext('2d').drawImage(frame.querySelector('img'),0,0);}
          const context=canvas.getContext('2d');
          return Object.fromEntries(Object.entries({wall:[750,180],floor:[750,840],wood:[1450,360],sofa:[900,480],table:[690,550],ceiling:[700,15],chair:[290,525]}).map(([key,[x,y]])=>[key,Array.from(context.getImageData(x,y,1,1).data)]));
        },original);
      }
      async function assertReferenceTone(surface,color) {
        const median=await page.evaluate(surface=>{
          const box=surface==='walls'?[550,140,430,200]:[450,750,800,180];
          const data=document.querySelector('[data-color-preview] canvas').getContext('2d').getImageData(...box).data;
          return [0,1,2].map(channel=>{
            const values=[];for(let p=channel;p<data.length;p+=4)values.push(data[p]);
            values.sort((a,b)=>a-b);return (values[values.length/2-1]+values[values.length/2])/2;
          });
        },surface);
        const expected=color.slice(1).match(/../g).map(n=>parseInt(n,16));
        assert.ok(median.every((value,c)=>Math.abs(value-expected[c])<=1),surface+' reference lighting preserves '+color);
      }
      const original=await pixels(true);
      const unlitWall=()=>page.evaluate(()=>{
        const data=document.querySelector('[data-color-preview] canvas').getContext('2d').getImageData(950,180,80,100).data;
        let total=0;for(let p=0;p<data.length;p+=4)total+=.2126*data[p]+.7152*data[p+1]+.0722*data[p+2];
        return total/(data.length/4);
      });
      for(const color of config.colors.keys()){
        await select('mode','standard');await select('color',color);await select('sealer','mate');await tick();
        const current=await pixels();assert.notDeepEqual(current.wall,original.wall);assert.deepEqual(current.floor,original.floor);
        for(const key of ['wood','sofa','table','ceiling','chair'])assert.deepEqual(current[key],original[key],key+' remains untouched');
        await assertReferenceTone('walls',preview.palette[color]);
        const matteTone=await unlitWall();await select('sealer','brillante');await tick();
        const glossTone=await unlitWall();
        assert.ok(glossTone<matteTone*.99 && glossTone>matteTone*.92,color+' gloss subtly darkens away from the reflection');
        const gloss=await pixels();assert.deepEqual(gloss.floor,original.floor);
        for(const key of ['wood','sofa','table','ceiling','chair'])assert.deepEqual(gloss[key],original[key]);
        await select('sealer','mate');await tick();assert.deepEqual(await pixels(),current,'returning to matte restores its exact appearance');
      }
      await select('color','extra-blanco');await select('sealer','mate');await panel.locator('[data-bold-quantity]').fill('1');await tick();
      const whiteWall=(await pixels()).wall;
      await surface('floor').click();assert.equal(await panel.locator('[data-bold-mode]').inputValue(),'');assert.equal(await panel.locator('[data-bold-quantity]').inputValue(),'');
      await select('mode','mix');await select('tone1','arena');await select('tone2','gris-cemento');await select('ratio','70');
      await select('sealer','mate');await panel.locator('[data-bold-quantity]').fill('2');await tick();
      let current=await pixels();assert.deepEqual(current.wall,whiteWall);assert.notDeepEqual(current.floor,original.floor);
      await assertReferenceTone('floor','#b8aa9d');
      await select('sealer','brillante');await tick();
      for(const key of ['wood','sofa','table','ceiling','chair'])assert.deepEqual(current[key],original[key]);
      const firstFloor=current.floor;await select('ratio','30');await tick();assert.notDeepEqual((await pixels()).floor,firstFloor);await select('ratio','70');
      await surface('walls').click();assert.equal(await panel.locator('[data-bold-color]').inputValue(),'extra-blanco');assert.equal(await panel.locator('[data-bold-quantity]').inputValue(),'1');
      await panel.locator('[data-preview-linked]').check();await tick();assert.match(await surface('floor').innerText(),/Extra Blanco/);
      await surface('floor').click();assert.equal(await panel.locator('[data-bold-quantity]').inputValue(),'2');assert.equal(await panel.locator('[data-bold-sealer]').inputValue(),'brillante');
      await panel.locator('[data-preview-linked]').uncheck();
      await select('mode','mix');await select('tone1','arena');await select('tone2','gris-cemento');await select('ratio','70');await tick();
      assert.match(await surface('walls').innerText(),/Extra Blanco/);
      for(const width of [1440,1024,768,390,320]){
        await page.setViewportSize({width,height:1000});await tick();
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow '+route+' '+width);
        const layout=await panel.locator('.kae-configurator-layout').boundingBox();assert.ok(layout.x>=0&&layout.x+layout.width<=width+1);
        if([1440,390,320].includes(width)){
          await panel.locator('[data-color-preview]').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
          await page.screenshot({path:path.join(output,(route==='/'?'home':'product')+'-'+width+'.png')});
        }
        checks.push({route,width,overflow:false});
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await surface('floor').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
      await panel.locator('.kae-preview-jump').click();
      assert.equal(await page.evaluate(()=>document.activeElement.dataset.previewSurface),'floor');
      assert.ok((await panel.locator('[data-color-preview]').boundingBox()).y>=90,'image clears the fixed navigation');
      await page.setViewportSize({width:1440,height:1000});await surface('walls').click();
      await panel.locator('[data-cart-add]').click();await tick();
      assert.equal(await panel.locator('[data-bold-mode]').inputValue(),'');assert.equal(await panel.locator('[data-bold-quantity]').inputValue(),'');
      assert.match(await surface('walls').innerText(),/Extra Blanco 100%\s+En carrito/);assert.deepEqual((await pixels()).wall,whiteWall);
      await surface('floor').click();assert.equal(await panel.locator('[data-bold-ratio]').inputValue(),'70');
      await panel.locator('[data-cart-add]').click();await tick();
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'3 kits');assert.match(await panel.locator('[data-cart-total]').innerText(),/1.096.500/);
      assert.match(await surface('floor').innerText(),/Arena 70%\s+\+ Gris Cemento 30%\s+En carrito/);
      const rows=panel.locator('.kae-cart-line');await rows.nth(1).getByRole('button',{name:/Editar/}).click();await tick();
      assert.ok(await surface('walls').isDisabled());await select('ratio','40');await panel.locator('[data-cart-add]').click();await tick();
      assert.match(await rows.nth(1).innerText(),/40 % Arena.*60 % Gris Cemento/);assert.ok(await surface('walls').isEnabled());
      await panel.locator('[data-bold-buy]').click();await page.locator('.kae-order-dialog').waitFor();await tick();assert.ok(await surface('walls').isDisabled());
      for(const [key,value]of Object.entries(customer)){
        const field=page.locator('dialog [name="'+key+'"]');
        if(key==='privacyAccepted')await field.check();else if(key==='documentType')await field.selectOption(value);else await field.fill(value);
      }
      await page.locator('.kae-order-continue').click();await page.waitForFunction(()=>window.__bold.length===1);
      assert.deepEqual(requests.at(-1).items,[
        {productId:'microcemento-kaemento-launch',quantity:1,colorMode:'standard',sealer:'mate',surface:'walls',color:'extra-blanco'},
        {productId:'microcemento-kaemento-launch',quantity:2,colorMode:'mix',sealer:'brillante',surface:'floor',color1:'arena',color2:'gris-cemento',percentage1:40,percentage2:60}
      ]);
      await page.waitForFunction(()=>!document.querySelector('[data-bold-buy]').hasAttribute('aria-busy'));
      await rows.nth(0).getByRole('button',{name:/Quitar/}).click();await tick();assert.equal(await surface('walls').locator('small').innerText(),'Sin seleccionar');
      await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await tick();
      assert.equal(await panel.locator('[data-cart-count]').innerText(),'0 kits');assert.equal(await surface('floor').locator('small').innerText(),'Sin seleccionar');
      await page.reload();await panel.locator('[data-color-preview]').waitFor();assert.equal(await panel.locator('[data-bold-mode]').inputValue(),'');
      checks.push({route,independentSurfaces:true,linkedColorIndependentKits:true,cartResetRetainsAppliedPreview:true,editRemove:true,orderSurfacePreserved:true,lifecycleCleared:true});
      await panel.locator('[data-color-preview]').scrollIntoViewIfNeeded();await surface('walls').click();
      await select('mode','standard');await select('color','terracota');await select('sealer','mate');
      await surface('floor').click();await select('mode','standard');await select('color','negro');await select('sealer','mate');
      const anchors={
        sala:{wall:[750,180],floor:[750,840],objects:[[900,480],[690,550],[1450,360]]},
        bano:{wall:[950,210],floor:[750,880],objects:[[490,500],[500,180],[500,402],[1210,570],[739,460],[637,390]]},
        cocina:{wall:[700,200],floor:[900,890],objects:[[630,520],[1180,185],[887,348],[323,408],[487,348],[115,860]]},
        dormitorio:{wall:[800,220],floor:[800,980],objects:[[780,730],[700,390],[388,444],[1165,580]]},
        comedor:{wall:[500,240],floor:[800,980],objects:[[1000,547],[600,680],[771,180],[950,690],[349,760],[500,510],[650,530],[900,480]]},
        terraza:{wall:[1050,250],floor:[900,850],objects:[[703,590],[964,640],[385,585],[235,540],[1480,600]]}
      };
      const fieldState=()=>panel.locator('[data-bold-mode],[data-bold-color],[data-bold-sealer],[data-bold-quantity]').evaluateAll(fields=>fields.map(f=>f.value));
      const initialFields=await fieldState();
      for(const [scene,points]of Object.entries(anchors)){
        await panel.locator('[data-preview-scene]').selectOption(scene);
        await page.waitForFunction(scene=>document.querySelector('[data-color-preview]').dataset.scene===scene&&document.querySelector('.kae-preview-scene').getAttribute('aria-busy')==='false',scene);
        await tick();assert.deepEqual(await fieldState(),initialFields,'switching rooms preserves the configuration');
        const sample=async original=>page.evaluate(({points,original})=>{
          const preview=document.querySelector('[data-color-preview]');let canvas=preview.querySelector('canvas');
          if(original){canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;canvas.getContext('2d').drawImage(preview.querySelector('img'),0,0);}
          const ctx=canvas.getContext('2d');return [points.wall,points.floor,...points.objects].map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));
        },{points,original});
        const base=await sample(true),matte=await sample(false);
        assert.notDeepEqual(matte[0],base[0],scene+' wall recolored');assert.notDeepEqual(matte[1],base[1],scene+' floor recolored');
        assert.deepEqual(matte.slice(2),base.slice(2),scene+' furniture and fittings unchanged');
        if(route.includes('/productos/')){
          const png=await panel.locator('canvas').evaluate(c=>c.toDataURL());
          fs.writeFileSync(path.join(output,scene+'-mate.png'),Buffer.from(png.split(',')[1],'base64'));
        }
        await page.evaluate(()=>{window.__mattePixels=document.querySelector('[data-color-preview] canvas').getContext('2d').getImageData(0,0,1536,1024).data;});
        await select('sealer','brillante');await tick();
        const gloss=await sample(false);assert.deepEqual(gloss[0],matte[0],scene+' wall finish remains independent');
        assert.deepEqual(gloss.slice(2),base.slice(2),scene+' gloss does not recolor furniture');
        const changed=await page.evaluate(()=>{
          const after=document.querySelector('[data-color-preview] canvas').getContext('2d').getImageData(0,0,1536,1024).data;
          let changed=0;for(let p=0;p<after.length;p+=4)if(after[p]!==window.__mattePixels[p])changed++;return changed;
        });
        assert.ok(changed>10000,scene+' visible finish difference');
        assert.match(await surface('floor').innerText(),/Sellador: Brillante/);
        if(route.includes('/productos/')){
          const png=await panel.locator('canvas').evaluate(c=>c.toDataURL());
          fs.writeFileSync(path.join(output,scene+'-brillante.png'),Buffer.from(png.split(',')[1],'base64'));
        }
        await select('sealer','mate');await tick();assert.deepEqual(await sample(false),matte,'Mate is reversible');
        await surface('walls').click();await select('sealer','brillante');await tick();
        const glossyWall=await sample(false);assert.deepEqual(glossyWall[1],matte[1],scene+' floor finish remains independent');
        assert.deepEqual(glossyWall.slice(2),base.slice(2),scene+' wall sheen preserves furniture');
        await select('sealer','mate');await surface('floor').click();await tick();
        checks.push({route,scene,preservedConfiguration:true,furnitureUnchanged:true,finishChangedPixels:changed});
      }
      for(const scene of ['bano','cocina','dormitorio','comedor','terraza','sala'])await panel.locator('[data-preview-scene]').selectOption(scene);
      await page.waitForFunction(()=>document.querySelector('.kae-preview-scene').getAttribute('aria-busy')==='false'&&document.querySelector('[data-color-preview] img').currentSrc.endsWith('/sala-base.webp'));
      await tick();assert.equal(await panel.locator('[data-bold-color]').inputValue(),'negro');
      await page.close();
    }
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify({status:'PASS',checks,jsErrors:errors,missingAssets:missing,syntheticCheckouts:requests.length,externalConversions:0},null,2));
    console.log(JSON.stringify({status:'PASS',checks:checks.length,syntheticCheckouts:requests.length,output}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
