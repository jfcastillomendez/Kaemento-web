(() => {
  const form = document.querySelector('[data-traffic-form]');
  if (!form) return;
  const colors = {amarillo:'Amarillo',blanco:'Blanco',negro:'Negro',azul:'Azul'};
  const buttons = [...document.querySelectorAll('[data-traffic-color]')];
  const colorStatus = document.getElementById('traffic-color-status');
  const colorLink = document.getElementById('trafico-color-whatsapp');
  const selected=new Set();
  function renderSelection(updateForm=true){
    const values=[...selected];
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(selected.has(button.dataset.trafficColor))));
    colorStatus.textContent=values.length?values.map(value=>colors[value]).join(' + ')+' · Pintura de Tráfico KAEMENTO':'Selecciona uno o varios colores';
    colorLink.textContent=values.length===1?'Comprar '+colors[values[0]].toLowerCase()+' · $108.885':'Comprar colores · $108.885 por galón';
    colorLink.href='#comprar-trafico';colorLink.removeAttribute('target');
    if(updateForm)form.elements.color.value=values.length===1?values[0]:'varios';
    window.KaementoTrafficPreview?.render(values);
  }
  renderSelection(false);
  buttons.forEach(button=>button.addEventListener('click',()=>{
    const value=button.dataset.trafficColor;
    if(selected.has(value))selected.delete(value);else selected.add(value);
    renderSelection();
  }));
  form.elements.color.addEventListener('change',()=>{
    if(Object.hasOwn(colors,form.elements.color.value)){selected.clear();selected.add(form.elements.color.value);}
    renderSelection(false);
  });
  const track = (event, buttonId) => window.kaementoTrack?.(event,{button_id:buttonId,product_id:'pintura-de-trafico'});
  document.querySelector('[data-traffic-distribution]')?.addEventListener('click',() => track('distributor_request','trafico-distribuidor'));
  // Wire only actual published technical documents. A request for a file is not a download.
  document.querySelectorAll('a[data-traffic-document][href$=".pdf"]').forEach(link => link.addEventListener('click',() => track('product_document_download',link.id)));
  const status = form.querySelector('[role="status"]');
  const submit = form.querySelector('button[type="submit"]');
  let busy=false, snapshot='', requestId='';
  form.hidden=false;
  form.addEventListener('focusin',() => track('quote_form_start','trafico-cotizacion'),{once:true});
  form.addEventListener('submit',async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const fields = new FormData(form);
    const data = {kind:'cotizacion-trafico'};
    for (const key of ['name','business','city','project','color','phone','website']) data[key]=String(fields.get(key)||'').trim();
    data.area=Number(fields.get('area')); data.privacyAccepted=fields.has('privacyAccepted');
    if (!/^\+?\d{7,15}$/.test(data.phone.replace(/[ ().-]/g,''))) {
      status.textContent='Revisa el teléfono: incluye entre 7 y 15 dígitos.'; form.elements.phone.focus(); return;
    }
    const current=JSON.stringify(data);
    // Same payload and UUID on retry; no personal information in browser storage or analytics.
    if (current!==snapshot || !requestId) {snapshot=current;requestId=crypto.randomUUID();}
    busy=true;submit.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Enviando tu solicitud…';
    const controls=[...form.querySelectorAll('input,select')];
    const colorDisabled=buttons.map(button=>button.disabled);
    controls.forEach(control=>control.disabled=true);buttons.forEach(button=>button.disabled=true);
    try {
      const response=await fetch('/api/red-kaemento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId}),signal:AbortSignal.timeout(15000)});
      if (!response.ok) {
        status.textContent=response.status===429?'Has alcanzado el límite de solicitudes. Intenta más tarde o consulta por WhatsApp.':response.status===400?'Revisa los datos y la autorización de tratamiento.':'No pudimos confirmar el envío. Tus datos siguen aquí; reintenta o consulta por WhatsApp.';
        return;
      }
      const result=await response.json();
      if (result.ok!==true) throw new Error('Unconfirmed');
      track('quote_form_success','trafico-cotizacion');
      status.textContent='Solicitud enviada a KAEMENTO. Nuestro equipo te contactará al teléfono indicado para preparar tu cotización.';
      form.reset();snapshot='';requestId='';selected.clear();renderSelection(false);
    } catch (_) {
      status.textContent='No pudimos confirmar el envío. Tus datos siguen aquí; reintenta en un momento o consulta por WhatsApp.';
    } finally {
      busy=false;submit.disabled=false;controls.forEach(control=>control.disabled=false);buttons.forEach((button,i)=>button.disabled=colorDisabled[i]);form.removeAttribute('aria-busy');
    }
  });
})();
