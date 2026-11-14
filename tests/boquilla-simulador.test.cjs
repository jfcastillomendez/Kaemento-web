const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const preview=require('../boquilla-simulador-config.js'),commerce=require('../bold-config.js');
test('Grout recoloring leaves unmarked tile/furniture pixels and source data unchanged',()=>{
 const original=new Uint8ClampedArray([180,105,60,255,170,165,152,255,15,140,175,255,241,236,226,255]);
 const copy=new Uint8ClampedArray(original);
 const mask=new Uint8ClampedArray([0,0,0,0,216,216,216,255,0,0,0,0,240,240,240,128]);
 const pixels=preview.maskPixels(mask),outputs=[];
 for(const tone of Object.keys(preview.tones)){
  const result=preview.recolor(original,pixels,tone);outputs.push(String(result));
  assert.deepEqual(result.slice(0,4),original.slice(0,4));assert.deepEqual(result.slice(8,12),original.slice(8,12));
  assert.equal(result[7],255);assert.equal(result[15],255);assert.notDeepEqual(result.slice(4,7),original.slice(4,7));
 }
 assert.equal(new Set(outputs).size,5);assert.deepEqual(original,copy);
 assert.throws(()=>preview.recolor(original,pixels,'rojo'));
});
test('Annotation extraction excludes natural wood, cyan tile, grey and beige; shades are preserved in grout',()=>{
 const plate=new Uint8ClampedArray([180,105,60,255,15,140,175,255,160,160,160,255,220,196,170,255,250,0,250,255,130,0,130,255]);
 const pixels=preview.groutPixels(plate);assert.deepEqual(pixels.map(x=>x[0]),[16,20]);
 assert.ok(pixels[0][2]>pixels[1][2]);
 const result=preview.recolor(plate,pixels,'extra-blanca');assert.ok(result[16]>result[20]);
});
test('Simulator is third, links from hero to simulator to kit, and only offers the five purchasable tones',()=>{
 const html=fs.readFileSync('productos/boquilla-magica.html','utf8');
 const sections=[...html.slice(html.indexOf('<main')).matchAll(/<section\b[^>]*>/g)].map(x=>x[0]);
 assert.match(sections[0],/boquilla-hero/);assert.match(sections[1],/consultar-boquilla/);assert.match(sections[2],/simulador-boquilla/);
 const toneKeys=[...html.matchAll(/data-boquilla-tone="([^"]+)"/g)].map(x=>x[1]);
 assert.deepEqual(toneKeys,[...commerce.boquillaColors.keys()]);assert.deepEqual(toneKeys,Object.keys(preview.tones));
 assert.match(html,/href="#simulador-boquilla">Prueba tu boquilla/);
 assert.match(html,/data-boquilla-choose href="#consultar-boquilla"/);
 for(const scene of Object.keys(preview.scenes)){
  assert.ok(fs.statSync('assets/boquilla/simulador-2026-11/'+preview.assetName(scene)+'-antes.webp').size>1000);
  assert.ok(fs.statSync('assets/boquilla/simulador-2026-11/'+preview.assetName(scene)+'-mascara.webp').size>1000);
 }
});

test('Shadowed grout annotations remain covered instead of leaving dark gaps',()=>{
 const pixels=preview.groutPixels(new Uint8ClampedArray([60,0,50,255,35,35,35,255,110,25,55,255]));
 assert.equal(pixels.length,1);assert.equal(pixels[0][0],0);assert.ok(pixels[0][1]>0);
});

test('Kitchen and bathroom use the reviewed installation photos and matching versioned masks',()=>{
 for(const scene of ['cocina','bano'])assert.equal(preview.assetName(scene),scene+'-replanteo-v2');
 const html=fs.readFileSync('productos/boquilla-magica.html','utf8');assert.match(html,/data-boquilla-before src="\/assets\/boquilla\/simulador-2026-11\/cocina-replanteo-v2-antes.webp"/);
});
