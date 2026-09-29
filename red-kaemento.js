(() => {
  for (const form of document.querySelectorAll('[data-network-form]')) {
    const status=form.querySelector('[role="status"]'),button=form.querySelector('button[type="submit"]');
    let busy=false,lastData='',requestId='';
    form.hidden=false;
    form.addEventListener('submit',async event=>{
      event.preventDefault();event.stopPropagation();
      if(busy || !form.reportValidity())return;
      const values=new FormData(form),kind=form.dataset.networkForm;
      const data={kind};
      for(const key of ['name','email','phone','city','profile','message','website'])data[key]=String(values.get(key)||'').trim();
      data.privacyAccepted=values.has('privacyAccepted');
      if(kind==='aplicadores') {
        data.areas=values.getAll('areas');data.experience=String(values.get('experience')||'');
        if(!data.areas.length) {status.textContent='Selecciona al menos una especialidad de interés.';form.querySelector('[name="areas"]').focus();return;}
      } else data.business=String(values.get('business')||'').trim();
      // Retry the same request with the same id. No contact data in storage, URLs or analytics.
      const snapshot=JSON.stringify(data);
      if(snapshot!==lastData || !requestId){requestId=crypto.randomUUID();lastData=snapshot;}
      busy=true;button.disabled=true;form.setAttribute('aria-busy','true');status.textContent='Enviando tu solicitud…';
      const controls=[...form.querySelectorAll('input,select,textarea')];controls.forEach(x=>x.disabled=true);
      try {
        const response=await fetch('/api/red-kaemento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,requestId}),signal:AbortSignal.timeout(15000)});
        if(!response.ok) {
          status.textContent=response.status===429?'Has alcanzado el límite de solicitudes. Intenta más tarde.':response.status===400?'Revisa tus datos y la autorización.':'No pudimos confirmar el envío. Reintenta en un momento o escríbenos a kaemento@gmail.com.';
          return;
        }
        const result=await response.json();if(result.ok!==true)throw new Error();
        status.textContent='Solicitud enviada a KAEMENTO. Revisaremos tu información y te contactaremos por correo o teléfono.';
        form.reset();lastData='';requestId='';
      } catch (_) {status.textContent='No pudimos confirmar el envío. Reintenta con los mismos datos en un momento.';}
      finally {busy=false;button.disabled=false;controls.forEach(x=>x.disabled=false);form.removeAttribute('aria-busy');}
    });
  }
})();
