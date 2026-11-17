const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('Every gallery thumbnail opens its own photograph, including the additive kit',()=>{
 const js=fs.readFileSync('gallery.js','utf8');
 const photos=JSON.parse(js.match(/^const photos = (\[.*?\]);/s)[1]);
 const html=fs.readFileSync('galeria.html','utf8');
 const buttons=[...html.matchAll(/<button[^>]*class="gallery-open"[^>]*>.*?<\/button>/gs)];
 assert.equal(buttons.length,photos.length);
 const seen=new Set();
 for(const [button] of buttons){
  const index=Number(button.match(/data-photo="(\d+)"/)[1]);
  const thumbnail=button.match(/src="([^"]+)"/)[1].replace(/^\.\//,'').replace(/^\//,'');
  const photo=photos.find(p=>p.id===index+1);
  assert.equal(photo?.thumb,thumbnail,thumbnail);
  assert.ok(!seen.has(index),'duplicate gallery destination');seen.add(index);
  assert.ok(fs.existsSync(photo.image));
 }
 assert.ok(photos.some(photo=>photo.title.includes('aditivo de 30 ml')));
});
