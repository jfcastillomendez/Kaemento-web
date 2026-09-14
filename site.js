// KAEMENTO visual refinement layer
if (!document.querySelector('link[data-kae-visual-refinement]')) {
  const refinement = document.createElement('link');
  refinement.rel = 'stylesheet';
  refinement.href = '/visual-refinement.css?v=2.0';
  refinement.dataset.kaeVisualRefinement = 'true';
  document.head.appendChild(refinement);
}

const WHATSAPP = "573003671548";
const EMAIL = "kaemento@gmail.com";

const menu=document.querySelector('.menu');
const nav=document.querySelector('.nav nav');
const groups=[...document.querySelectorAll('.nav-group')];
function setGroup(group,open){group.classList.toggle('submenu-open',open);group.querySelector('.submenu-toggle')?.setAttribute('aria-expanded',String(open));}
function closeGroups(){groups.forEach(g=>setGroup(g,false));}
function closeMenu(){nav?.classList.remove('open');menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','Abrir menú');closeGroups();}
menu?.addEventListener('click',()=>{const open=!nav?.classList.contains('open');closeGroups();nav?.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',closeMenu));
groups.forEach(group=>{
 const toggle=group.querySelector('.submenu-toggle');
 toggle?.addEventListener('click',e=>{e.stopPropagation();const open=!group.classList.contains('submenu-open');closeGroups();setGroup(group,open);});
 group.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&matchMedia('(min-width:901px)').matches){closeGroups();setGroup(group,true);}});
 group.addEventListener('pointerleave',()=>{if(!group.contains(document.activeElement))setGroup(group,false);});
 group.addEventListener('focusout',e=>{if(!group.contains(e.relatedTarget))setGroup(group,false);});
});
document.addEventListener('click',e=>{if(e.target instanceof Element&&!e.target.closest('.nav-group'))closeGroups();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const openGroup=groups.find(g=>g.classList.contains('submenu-open'));if(openGroup){setGroup(openGroup,false);openGroup.querySelector('.submenu-toggle')?.focus();}else if(nav?.classList.contains('open')){closeMenu();menu?.focus();}}});
document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{
  const group=button.closest(".filter-zone");
  group?.querySelectorAll("[data-filter]").forEach(b=>{b.classList.toggle("active",b===button);b.setAttribute("aria-pressed",String(b===button));});
  const selected=button.dataset.filter;
  group?.querySelectorAll(".filter-item").forEach(item=>{item.hidden=selected!=="todos"&&!item.dataset.category?.split(" ").includes(selected)});
}));

document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b.classList.contains("active"))));

const isMicrocemento = location.pathname === '/productos/microcemento-kaemento.html';
const track = (event, buttonId, extra={}) => window.kaementoTrack?.(event, {button_id:buttonId,...extra});
// Capture the explicit CTA before other click handlers. Do not prevent navigation
// or stop propagation: automatic Google events keep their existing behavior.
document.addEventListener('click', event => {
  if (!isMicrocemento || !(event.target instanceof Element)) return;
  const cta = event.target.closest('a[data-microcemento-cta]');
  if (cta) track('microcemento_cta_click', cta.id);
}, {capture:true});
document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const a=event.target.closest('a[href]'); if(!a)return;
  const id=a.id || (a.classList.contains('whatsapp')?'whatsapp-floating':'link-'+[...document.querySelectorAll('a[href]')].indexOf(a));
  if(a.href.startsWith('https://wa.me/573003671548')) {track('whatsapp_click',id); if(isMicrocemento)track('microcemento_whatsapp_click',id);}
  if(!isMicrocemento)return;
  if(a.pathname.endsWith('/catalogo-comercial-microcemento-kaemento-2026.pdf'))track('microcemento_catalog_download',id);
  if(a.pathname.endsWith('/manual-aplicacion-microcemento-kaemento.pdf'))track('microcemento_manual_download',id);
});
document.querySelectorAll('form').forEach(form => {
  const micro=form.id==='microcemento-form';
  if(micro)form.addEventListener('focusin',()=>track('microcemento_form_start','microcemento-form'),{once:true});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const data=new FormData(form), value=k=>String(data.get(k)||'Por definir').trim();
    const lines=micro ? [
      'Hola KAEMENTO, estoy interesado en Microcemento KAEMENTO.','',
      `Nombre: ${value('nombre')}`,`Teléfono: ${value('telefono')}`,`Ciudad: ${value('ciudad')}`,
      `Área aproximada en m²: ${value('area')}`,`Superficie actual: ${value('superficie')}`,
      `Aplicación en pisos, paredes o ambos: ${value('aplicacion')}`,`Color de interés: ${value('color')}`,
      `¿Requiere solo material o también instalación?: ${value('modalidad')}`,`Descripción: ${value('descripcion')}`,
      data.has('fotografias')?'Enviaré fotografías por WhatsApp.':''
    ] : ['Hola KAEMENTO, quiero solicitar una cotización.','',...[
      ['Nombre','nombre'],['Teléfono','telefono'],['Correo','correo'],['Ciudad','ciudad'],['Servicio o producto','servicio'],['Empresa o copropiedad','empresa'],['Área aproximada (m²)','area'],['Tipo de proyecto','tipo'],['Estado actual','soporte'],['Fecha estimada','fecha'],['Descripción','descripcion']
    ].map(([label,key])=>`${label}: ${value(key)}`)];
    // Personal data is used exclusively to prepare the user-reviewed WhatsApp message.
    const url=`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(url,'_blank','noopener,noreferrer');
    track('whatsapp_click',micro?'microcemento-form':'quote-form');
    if(micro)track('microcemento_whatsapp_click','microcemento-form');
    track('generate_lead',micro?'microcemento-form':'quote-form',{lead_stage:'whatsapp_handoff'});
    let status=form.querySelector('[role=status]');
    if(!status){status=document.createElement('p');status.setAttribute('role','status');form.appendChild(status);}
    status.textContent='Solicitud preparada. Revise el mensaje en WhatsApp antes de enviarlo. Si su navegador bloqueó la ventana, permita ventanas emergentes y vuelva a pulsar el botón.';
  });
  // Attach handler before enabling submission. Without JS there are no live form fields.
  form.querySelector('button').type='submit';form.hidden=false;
});
