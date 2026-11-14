(() => {
  const root=document.getElementById('simulador-boquilla'),config=window.KaementoBoquillaPreview;
  if(!root || !config)return;
  const sceneSelect=root.querySelector('[data-boquilla-scene]'),toneButtons=[...root.querySelectorAll('[data-boquilla-tone]')];
  const modes=[...root.querySelectorAll('[data-boquilla-view]')],range=root.querySelector('[data-boquilla-compare]');
  const frame=root.querySelector('.boquilla-sim-frame'),before=root.querySelector('[data-boquilla-before]'),canvas=root.querySelector('canvas');
  const status=root.querySelector('[data-boquilla-sim-status]'),current=root.querySelector('[data-boquilla-current-tone]'),chosen=root.querySelector('[data-boquilla-choose]');
  const context=canvas.getContext('2d'),cache=new Map(),storageKey='kaemento-boquilla-preview-v1';
  let state={scene:'cocina',tone:'extra-blanca',view:'compare',split:35},generation=0,active;
  try {
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved && config.scenes[saved.scene] && config.tones[saved.tone] && ['before','compare','after'].includes(saved.view) && Number.isFinite(saved.split) && saved.split>=0 && saved.split<=100)state=saved;
  }catch(_){}
  function save(){try {localStorage.setItem(storageKey,JSON.stringify(state));}catch(_) {}}
  function updateView(){
    const split=state.view==='before'?100:state.view==='after'?0:state.split;
    frame.style.setProperty('--boquilla-split',split+'%');
    frame.dataset.view=state.view;
    before.style.clipPath=active?'inset(0 '+(100-split)+'% 0 0)':'none';
    range.value=String(state.split);range.disabled=state.view!=='compare'||!active;
    range.setAttribute('aria-valuetext',state.split+'% antes y '+(100-state.split)+'% renovado');
    modes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.boquillaView===state.view)));
  }
  function updateTone(){
    toneButtons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.boquillaTone===state.tone)));
    current.textContent=config.tones[state.tone].label;
    chosen.textContent='Elegir '+config.tones[state.tone].label+' para mi kit ↗';
    canvas.setAttribute('aria-label',config.scenes[state.scene]+' con juntas renovadas en '+config.tones[state.tone].label);
    if(active){
      context.putImageData(new ImageData(config.recolor(active.original,active.pixels,state.tone),active.width,active.height),0,0);
      status.textContent=config.scenes[state.scene]+' · Boquilla '+config.tones[state.tone].label+'. Cambia el tono o desliza para comparar.';
    }
  }
  function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Image unavailable'));image.src=src;});}
  async function loadScene(scene){
    if(cache.has(scene))return cache.get(scene);
    const task=(async()=>{
      const path='/assets/boquilla/simulador-2026-11/'+config.assetName(scene);
      const [base,plate]=await Promise.all([loadImage(path+'-antes.webp'),loadImage(path+'-mascara.webp?v=3')]);
      const work=document.createElement('canvas');work.width=base.naturalWidth;work.height=base.naturalHeight;
      const ctx=work.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(base,0,0);const original=ctx.getImageData(0,0,work.width,work.height).data;
      ctx.clearRect(0,0,work.width,work.height);ctx.drawImage(plate,0,0,work.width,work.height);const pixels=config.maskPixels(ctx.getImageData(0,0,work.width,work.height).data);
      if(pixels.length<100)throw new Error('Grout annotation unavailable');
      return {original,pixels,width:work.width,height:work.height};
    })();
    cache.set(scene,task);
    try{const result=await task;while(cache.size>2){const oldest=cache.keys().next().value;if(oldest===scene)break;cache.delete(oldest);}return result;}
    catch(error){cache.delete(scene);throw error;}
  }
  async function changeScene(){
    const request=++generation;active=null;canvas.hidden=true;root.setAttribute('aria-busy','true');
    before.src='/assets/boquilla/simulador-2026-11/'+config.assetName(state.scene)+'-antes.webp';
    before.alt=config.scenes[state.scene]+' con juntas deterioradas, antes de la renovación';
    sceneSelect.value=state.scene;status.textContent='Preparando '+config.scenes[state.scene]+'…';updateView();
    try{
      const result=await loadScene(state.scene);if(request!==generation)return;
      active=result;canvas.width=result.width;canvas.height=result.height;updateTone();canvas.hidden=false;updateView();
    }catch(_){if(request===generation){status.textContent='No pudimos cargar la simulación. Puedes volver a elegir el ambiente para reintentar.';before.style.clipPath='none';}}
    finally{if(request===generation)root.removeAttribute('aria-busy');}
  }
  sceneSelect.addEventListener('change',()=>{if(!config.scenes[sceneSelect.value])return;state.scene=sceneSelect.value;save();changeScene();});
  toneButtons.forEach(button=>button.addEventListener('click',()=>{state.tone=button.dataset.boquillaTone;if(state.view==='before')state.view='after';save();updateTone();updateView();}));
  modes.forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.boquillaView;save();updateView();}));
  range.addEventListener('input',()=>{state.split=Number(range.value);save();updateView();});
  chosen.addEventListener('click',event=>{
    const field=document.querySelector('[data-boquilla-color]');
    if(!field || field.disabled){event.preventDefault();status.textContent='Termina o cierra el pago actual antes de elegir otro tono.';return;}
    event.preventDefault();
    field.value=state.tone;field.dispatchEvent(new Event('input',{bubbles:true}));
    if(location.hash!=='#consultar-boquilla')history.pushState(null,'','#consultar-boquilla');
    document.getElementById('consultar-boquilla').scrollIntoView({behavior:'instant',block:'start'});
    field.focus({preventScroll:true});
  });
  document.querySelector('.boquilla-hero a[href="#simulador-boquilla"]')?.addEventListener('click',event=>{
    event.preventDefault();
    if(location.hash!=='#simulador-boquilla')history.pushState(null,'','#simulador-boquilla');
    root.scrollIntoView({behavior:'instant',block:'start'});
  });
  if(!context){status.textContent='Tu navegador no permite la vista interactiva. Consulta los cinco colores en el kit.';return;}
  updateTone();changeScene();
})();
