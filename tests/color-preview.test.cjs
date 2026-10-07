const {test}=require('node:test');
const assert=require('node:assert/strict');
const {palette,colorFor}=require('../microcemento-preview-render.js');
const config=require('../bold-config.js');
test('Every available room has its own image and geometry',()=>{
  const {scenes}=require('../microcemento-preview-render.js');
  const fs=require('node:fs'),path=require('node:path');
  assert.deepEqual(Object.keys(scenes),['sala','bano','cocina','dormitorio','comedor','terraza']);
  for(const [id,scene]of Object.entries(scenes)){
    assert.ok(fs.existsSync(path.join(__dirname,'..',scene.src)),'image '+id);
    assert.ok(scene.wall.startsWith('M')&&scene.floor.startsWith('M'));
    for(const value of Object.values(scene.brightness))assert.ok(value>0&&value<1);
  }
  assert.equal(new Set(Object.values(scenes).map(scene=>scene.src)).size,6);
});
test('Every purchasable standard color has a digital reference',()=>{
  assert.deepEqual(Object.keys(palette),[...config.colors.keys()]);
  for(const color of config.colors.keys())assert.match(colorFor({colorMode:'standard',color}),/^#[a-f0-9]{6}$/);
});
test('Digital tones retain the launch references with the requested gray display correction',()=>{
  assert.deepEqual(palette,{
    'extra-blanco':'#e6e1dc',arena:'#bfac9a','gris-cemento':'#888684',negro:'#2b2b2a',terracota:'#a06145'
  });
});
test('Specified proportions produce the independently calculated digital tone',()=>{
  // 70% (191,172,154) + 30% (136,134,132) = (174.5,160.6,147.4).
  assert.equal(colorFor({colorMode:'mix',color1:'arena',color2:'gris-cemento',percentage1:70,percentage2:30}),'#afa193');
  // Equal parts (230,225,220) and (43,43,42), rounded once to 8-bit channels.
  assert.equal(colorFor({colorMode:'mix',color1:'extra-blanco',color2:'negro',percentage1:50,percentage2:50}),'#898683');
});
test('Mixtures are symmetric and their proportions affect the preview',()=>{
  for(const color1 of config.colors.keys())for(const color2 of config.colors.keys()) {
    if(color1===color2)continue;
    const results=new Set();
    for(let percentage1=10;percentage1<=90;percentage1+=10){
      const percentage2=100-percentage1;
      const color=colorFor({colorMode:'mix',color1,color2,percentage1,percentage2});
      assert.equal(color,colorFor({colorMode:'mix',color1:color2,color2:color1,percentage1:percentage2,percentage2:percentage1}));
      results.add(color);
    }
    assert.equal(results.size,9,'Every allowed proportion has a distinct digital tone');
  }
});
test('Incomplete, invalid or identical-tone selections cannot invent a resulting shade',()=>{
  for(const selection of [null,{}, {colorMode:'standard',color:'invalid'},
    {colorMode:'mix',color1:'arena',color2:'arena',percentage1:50,percentage2:50},
    {colorMode:'mix',color1:'arena',color2:'negro',percentage1:35,percentage2:65},
    {colorMode:'mix',color1:'arena',color2:'negro',percentage1:30,percentage2:30},
    {colorMode:'mix',color1:'arena',color2:'negro',percentage1:NaN,percentage2:NaN}])assert.equal(colorFor(selection),null);
});
