const WHATSAPP = "573003671548";
const EMAIL = "kaemento@gmail.com";

window.dataLayer = window.dataLayer || [];
const trackWhatsapp = (link, source) => {
  if (typeof window.gtag === "function") window.gtag("event", "whatsapp_click", {event_category:"engagement",event_label:source,link_url:link,transport_type:"beacon"});
};

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
 group.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'&&matchMedia('(min-width:721px)').matches){closeGroups();setGroup(group,true);}});
 group.addEventListener('pointerleave',()=>{if(!group.contains(document.activeElement))setGroup(group,false);});
 group.addEventListener('focusout',e=>{if(!group.contains(e.relatedTarget))setGroup(group,false);});
});
document.addEventListener('click',e=>{if(e.target instanceof Element&&!e.target.closest('.nav-group'))closeGroups();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const openGroup=groups.find(g=>g.classList.contains('submenu-open'));if(openGroup){setGroup(openGroup,false);openGroup.querySelector('.submenu-toggle')?.focus();}else if(nav?.classList.contains('open')){closeMenu();menu?.focus();}}});
document.addEventListener("click",event=>{if(!(event.target instanceof Element))return;const a=event.target.closest('a[href*="wa.me/"]');if(a)trackWhatsapp(a.href,a.getAttribute("aria-label")||a.textContent.trim()||"whatsapp_link")});

document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{
  const group=button.closest(".filter-zone");
  group?.querySelectorAll("[data-filter]").forEach(b=>{b.classList.toggle("active",b===button);b.setAttribute("aria-pressed",String(b===button));});
  const selected=button.dataset.filter;
  group?.querySelectorAll(".filter-item").forEach(item=>{item.hidden=selected!=="todos"&&!item.dataset.category?.split(" ").includes(selected)});
}));

const form=document.querySelector(".quote form");
form?.addEventListener("submit",event=>{
  event.preventDefault();const data=new FormData(form);
  const text=["Hola KAEMENTO, quiero solicitar una cotización.",`Nombre: ${data.get("nombre")}`,`Teléfono: ${data.get("telefono")}`,`Correo: ${data.get("correo")}`,`Ciudad: ${data.get("ciudad")}`,`Servicio o producto: ${data.get("servicio")}`,`Empresa o copropiedad: ${data.get("empresa")||"No indicada"}`,`Área aproximada (m²): ${data.get("area")||"Por definir"}`,`Tipo de proyecto: ${data.get("tipo")||"Por definir"}`,`Estado actual: ${data.get("soporte")||"Por describir"}`,`Fecha estimada: ${data.get("fecha")||"Por definir"}`,`Descripción: ${data.get("descripcion")}`].join("\n");
  const url=`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`;trackWhatsapp(url,"quote_form");
  window.open(url,"_blank","noopener,noreferrer");
});

document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b.classList.contains("active"))));
