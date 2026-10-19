(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.KaementoTrafficCoverage=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Rendimiento de referencia proporcionado por KAEMENTO: 70 m × 0,10 m = 7 m².
  function estimate(value,mode='lineal') {
    if(!['lineal','area'].includes(mode)) return null;
    const text=String(value).trim();
    if(!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    const [whole,fraction='']=text.split('.');
    const hundredths=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    if(!Number.isSafeInteger(hundredths)) return null;
    const unit=mode==='lineal'?7000:700;
    const gallons=Math.floor(hundredths/unit)+(hundredths%unit?1:0);
    return {gallons,area:hundredths/(mode==='lineal'?1000:100),quantity:hundredths/100};
  }
  return Object.freeze({estimate});
});

if(typeof document!=='undefined') (()=>{
  const calculator=document.querySelector('[data-traffic-calculator]');
  if(!calculator) return;
  const panel=document.getElementById('comprar-trafico');
  // Floating shortcuts must not appear over checkout when a mobile input loses focus.
  new IntersectionObserver(entries=>{
    document.body.classList.toggle('traffic-purchase-active',entries.some(entry=>entry.isIntersecting));
  },{rootMargin:'48px 0px',threshold:0}).observe(panel);
  const mode=calculator.querySelector('[data-coverage-mode]');
  const inputs=[...calculator.querySelectorAll('[data-coverage-color]')];
  const apply=calculator.querySelector('[data-coverage-apply]');
  const status=calculator.querySelector('[data-coverage-status]');
  const names={amarillo:'Amarillo',blanco:'Blanco',negro:'Negro',azul:'Azul'};
  const format=n=>new Intl.NumberFormat('es-CO',{maximumFractionDigits:3}).format(n);
  let estimates={};
  function refresh(){
    estimates={};let valid=true,hasPurchase=false,totalArea=0;
    for(const input of inputs){
      const color=input.dataset.coverageColor;
      const output=calculator.querySelector('[data-coverage-result="'+color+'"]');
      const result=input.value===''?null:window.KaementoTrafficCoverage.estimate(input.value,mode.value);
      input.setAttribute('aria-invalid',String(input.validity.badInput || (input.value!=='' && !result)));
      if(input.validity.badInput || (input.value!=='' && !result))valid=false;
      output.textContent=result?format(result.gallons)+(result.gallons===1?' galón':' galones'):'—';
      if(result){estimates[color]=result;totalArea+=result.area;if(result.gallons>0)hasPurchase=true;}
      calculator.querySelector('[data-coverage-unit="'+color+'"]').textContent=mode.value==='lineal'?'metros lineales':'m² pintados';
    }
    const blocked=['amarillo','blanco','negro','azul'].some(color=>panel.querySelector('[name="'+color+'"]').disabled);
    apply.disabled=!valid || !hasPurchase || blocked;
    status.textContent=!valid?'Revisa las medidas: usa valores positivos o cero, con hasta dos decimales.':totalArea>0?format(totalArea)+' m² de pintura en total. Los galones se redondean hacia arriba por color.':'Ingresa la medida de cada color que necesitas.';
  }
  inputs.forEach(input=>input.addEventListener('input',refresh));
  // Keep the calculator in sync while checkout temporarily locks purchase fields.
  const purchaseState=new MutationObserver(refresh);
  for(const color of ['amarillo','blanco','negro','azul']){
    purchaseState.observe(panel.querySelector('[name="'+color+'"]'),{attributes:true,attributeFilter:['disabled']});
  }
  mode.addEventListener('change',()=>{inputs.forEach(input=>{input.value='';});refresh();});
  apply.addEventListener('click',()=>{
    refresh();if(apply.disabled)return;
    for(const color of ['amarillo','blanco','negro','azul']){
      if(!estimates[color])continue;
      const input=panel.querySelector('[name="'+color+'"]');
      input.value=String(estimates[color].gallons);
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    status.textContent='Cantidades actualizadas en la compra. Puedes ajustarlas abajo.';
    panel.querySelector('[data-traffic-total]').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  });
  function clear(){inputs.forEach(input=>{input.value='';});refresh();}
  window.addEventListener('pagehide',clear);
  window.addEventListener('pageshow',event=>{if(event.persisted)clear();});
  refresh();
})();
