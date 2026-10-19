// Photo-backed layers: the unmarked photo stays fixed while paint layers accumulate.
(() => {
  const wrapper=document.querySelector('.traffic-preview');
  if(!wrapper)return;
  new IntersectionObserver(entries=>document.body.classList.toggle('traffic-preview-active',entries.some(entry=>entry.isIntersecting)),{threshold:0}).observe(wrapper);
  const image=wrapper.querySelector('[data-traffic-preview]');
  const canvas=wrapper.querySelector('canvas');
  const context=canvas.getContext('2d');
  const select=wrapper.querySelector('[data-traffic-scene]');
  const before=wrapper.querySelector('[data-traffic-before]');
  const caption=wrapper.querySelector('[data-traffic-preview-caption]');
  const names={amarillo:'Amarillo',blanco:'Blanco',negro:'Negro',azul:'Azul'};
  // Coordinates refer to the inspected 1536 × 1024 source photographs.
  const scenes={
    'zonas-comunes-exteriores':{label:'Zonas comunes exteriores',white:[[[0,565],[490,570],[1485,591],[1500,715],[0,654]]],floor:[[0,630],[760,430],[1536,450],[1536,1024],[0,1024]],black:[]},
    parqueadero:{label:'Parqueadero',blue:[[815,545],[1536,505],[1536,725],[1140,780]],white:[[[0,452],[652,442],[730,489],[0,506]],[[267,678],[375,575],[500,674],[439,676],[491,955],[360,973],[347,676]]],yellow:[[0,208,50,35],[100,250,49,24],[154,254,43,24],[195,264,33,20],[550,254,63,22],[688,232,92,34],[860,209,193,39]],floor:[[0,460],[240,315],[410,315],[1536,490],[1536,1024],[0,1024]],black:[[17,315,25,112],[100,300,18,67],[140,298,18,67],[185,292,19,55],[217,287,14,42],[550,295,17,60],[690,310,34,95],[860,326,48,145],[1062,385,80,32],[1190,407,126,34],[1380,436,156,42]]},
    'cocina-industrial':{label:'Cocina industrial',floor:[[600,1024],[980,380],[1150,380],[1536,1024]],black:[[0,410,275,330],[850,270,50,65]]},
    'columnas-sardineles':{label:'Columnas y sardineles',white:[[[1170,385],[1235,390],[330,1024],[145,1024]],[[0,620],[710,705],[710,745],[0,660]],[[355,505],[955,545],[955,577],[355,535]],[[0,574],[75,582],[75,605],[0,599]],[[930,378],[1536,378],[1536,470],[930,470]],[[1260,565],[1470,565],[1470,880],[1260,880]]],blue:[[1140,395],[1380,395],[1395,445],[1100,445]],floor:[[0,530],[800,380],[1536,380],[1536,1024],[0,1024]],black:[[70,320,295,330],[810,310,125,150],[1000,305,75,95],[1485,300,51,100],[0,380,825,180]]},
    'bodega-logistica':{label:'Bodega y centro logístico',floor:[[0,775],[610,375],[730,375],[1536,820],[1536,1024],[0,1024]],black:[[0,440,45,290],[125,430,25,240],[355,380,30,140],[500,345,30,120],[1035,345,90,100],[1435,370,45,155],[530,345,80,65],[685,340,30,55],[845,345,55,60]]},
    'fabrica-industrial':{label:'Fábrica industrial',floor:[[0,920],[310,335],[490,335],[1536,735],[1536,1024],[0,1024]],black:[[0,330,150,250],[215,300,85,100],[475,300,100,75],[960,320,135,165]]},
    'taller-industrial':{label:'Taller mecánico',blue:[[1065,605],[1270,605],[1270,680],[1065,680]],floor:[[0,690],[320,390],[465,390],[1000,490],[1260,430],[1536,440],[1536,1024],[0,1024]],black:[[160,365,55,110],[460,355,90,65],[630,365,50,95],[1040,395,200,205],[1225,365,30,105]]},
    'rampa-vehicular':{label:'Rampa vehicular',floor:[[0,750],[645,280],[965,280],[1536,735],[1536,1024],[0,1024]],black:[[140,385,50,205],[1410,390,65,210]]},
    'pasillos-industriales':{label:'Pasillos peatonales',floor:[[0,1024],[290,325],[410,325],[1536,850],[1536,1024]],black:[[775,275,115,130],[1100,270,200,235],[290,275,20,80]]},
    colegio:{label:'Colegio',white:[[[0,438],[700,435],[880,535],[0,525]],[[300,950],[438,580],[533,668],[465,671],[440,951]]],blue:[[920,440],[1240,425],[1536,470],[1536,615],[1135,635]],floor:[[0,510],[225,425],[1536,440],[1536,1024],[0,1024]],black:[[210,320,75,95],[370,315,30,50],[640,310,30,50],[710,315,55,105]]}
  };
  const cache=new Map();
  let selected=[],showBefore=false,revision=0,current=null;
  function inside(x,y,points){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  function photo(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}
  function closeHoles(indices){
    const width=1536,height=1024,radius=2;
    let mask=new Uint8Array(width*height);
    for(const i of indices)mask[i/4]=1;
    function pass(source,horizontal,dilate){
      const target=new Uint8Array(source.length),lines=horizontal?height:width,length=horizontal?width:height;
      for(let line=0;line<lines;line++){
        const at=position=>horizontal?line*width+position:position*width+line;
        let sum=0;for(let p=0;p<=radius;p++)sum+=source[at(p)];
        for(let p=0;p<length;p++){
          const size=Math.min(length-1,p+radius)-Math.max(0,p-radius)+1;
          target[at(p)]=dilate?Number(sum>0):Number(sum===size);
          if(p-radius>=0)sum-=source[at(p-radius)];
          if(p+radius+1<length)sum+=source[at(p+radius+1)];
        }
      }
      return target;
    }
    mask=pass(pass(pass(pass(mask,true,true),false,true),true,false),false,false);
    const output=[];for(let i=0;i<mask.length;i++)if(mask[i])output.push(i*4);
    return output;
  }
  async function load(key){
    if(cache.has(key))return cache.get(key);
    const task=Promise.all([photo('/assets/pintura-trafico/simulador/'+key+'.webp'),photo('/assets/pintura-trafico/simulador/'+key+'-sin-marcas.webp')]).then(([painted,clean])=>{
      const work=document.createElement('canvas');work.width=1536;work.height=1024;const ctx=work.getContext('2d',{willReadFrequently:true});ctx.drawImage(painted,0,0,1536,1024);const full=ctx.getImageData(0,0,1536,1024);
      ctx.clearRect(0,0,1536,1024);ctx.drawImage(clean,0,0,1536,1024);const base=ctx.getImageData(0,0,1536,1024);
      const layers={amarillo:[],blanco:[],negro:[],azul:[]},scene=scenes[key];
      for(let pixel=0;pixel<1536*1024;pixel++){
        const i=pixel*4,x=pixel%1536,y=Math.floor(pixel/1536),r=full.data[i],g=full.data[i+1],b=full.data[i+2];
        const floor=inside(x,y,scene.floor),black=scene.black.some(([bx,by,w,h])=>x>=bx&&x<bx+w&&y>=by&&y<by+h);
        const yellowArea=scene.yellow?(floor||black||scene.yellow.some(([bx,by,w,h])=>x>=bx&&x<bx+w&&y>=by&&y<by+h)):y>270;
        if(scene.blue&&inside(x,y,scene.blue))layers.azul.push(i);
        if(yellowArea&&r>105&&g>75&&b<g*.78&&r>g*.95&&r<g*1.95)layers.amarillo.push(i);
        else if((scene.white?.some(points=>inside(x,y,points))&&Math.min(r,g,b)>105&&Math.max(r,g,b)-Math.min(r,g,b)<40)||(floor&&Math.min(r,g,b)>185&&Math.max(r,g,b)-Math.min(r,g,b)<45))layers.blanco.push(i);
        else if(black&&Math.max(r,g,b)<95&&Math.max(r,g,b)-Math.min(r,g,b)<35)layers.negro.push(i);
      }
      layers.blanco=closeHoles(layers.blanco);layers.amarillo=closeHoles(layers.amarillo);
      return {full,base,layers};
    }).catch(error=>{cache.delete(key);throw error;});
    if(cache.size>=2)cache.delete(cache.keys().next().value);
    cache.set(key,task);return task;
  }
  function paint(){
    if(!current)return;
    const pixels=new Uint8ClampedArray(current.base.data);
    for(const color of showBefore?[]:selected)for(const i of current.layers[color]){pixels[i]=current.full.data[i];pixels[i+1]=current.full.data[i+1];pixels[i+2]=current.full.data[i+2];}
    context.putImageData(new ImageData(pixels,1536,1024),0,0);
    const colors=selected.map(color=>names[color]);
    const absent=selected.filter(color=>current.layers[color].length<300);
    wrapper.querySelector('[data-scene-applicability]').textContent=absent.length?'En este espacio no hay demarcación de referencia para: '+absent.map(color=>names[color]).join(', ')+'.':'';
    const detail=showBefore||!colors.length?'Sin demarcaciones':colors.join(' + ');
    caption.textContent=scenes[select.value].label+' · '+detail+'.';
    canvas.setAttribute('aria-label',caption.textContent);
    before.setAttribute('aria-pressed',String(showBefore));before.textContent=showBefore?'Ver selección':'Ver sin demarcación';
    canvas.dataset.colors=(showBefore?[]:selected).join(',');
    canvas.dataset.scene=select.value;
    canvas.hidden=false;image.hidden=true;
    wrapper.removeAttribute('aria-busy');
  }
  async function changeScene(){
    selected=[];showBefore=false;
    const id=++revision,key=select.value;current=null;wrapper.setAttribute('aria-busy','true');canvas.hidden=true;image.hidden=false;image.src='/assets/pintura-trafico/simulador/'+key+'-sin-marcas.webp';image.alt=scenes[key].label+' sin demarcaciones';
    try{const data=await load(key);if(id!==revision)return;current=data;paint();}
    catch(_){if(id!==revision)return;wrapper.removeAttribute('aria-busy');caption.textContent='No pudimos cargar la simulación. Vuelve a elegir el espacio para reintentar.';}
  }
  window.KaementoTrafficPreview={render(colors){selected=colors.filter(c=>Object.hasOwn(names,c));showBefore=false;paint();}};
  select.addEventListener('change',changeScene);
  before.addEventListener('click',()=>{showBefore=!showBefore;paint();});
  changeScene();
})();
