/* Public, local-only search. Queries never leave this document or enter storage. */
(() => {
  'use strict';
  // Curated destinations: no personal information, prices or live order data.
  const entries = [
    ['Microcemento KAEMENTO', 'Producto', '/productos/microcemento-kaemento.html', 'Conoce el sistema, sus componentes y acabados.', 'micro cemento kit revestimiento continuo pisos paredes'],
    ['Configura y compra tu kit', 'Compra', '/productos/microcemento-kaemento.html#comprar-microcemento', 'Elige colores, mezcla de tonos, sellador y cantidad de kits.', 'microcemento comprar precio carrito pago bold lanzamiento oferta descuento mate brillante'],
    ['Colores de Microcemento KAEMENTO', 'Producto', '/productos/microcemento-kaemento.html#colores', 'Extra Blanco, Arena, Gris Cemento, Negro y Terracota.', 'paleta color tonos mezcla personalizados'],
    ['Microcemento arquitectónico', 'Servicio', '/servicios/microcemento-arquitectonico.html', 'Aplicación de microcemento en pisos, muros y espacios arquitectónicos.', 'instalacion instalador aplicacion terraza baño cocina'],
    ['Manual de Aplicación Microcemento KAEMENTO', 'Documento PDF', '/catalogos/manual-aplicacion-microcemento-kaemento.pdf', 'Consulta el paso a paso de aplicación del sistema.', 'descarga instrucciones capas preparacion mezclado sellado'],
    ['Manual Técnico Comercial Microcemento KAEMENTO', 'Documento PDF', '/catalogos/manual-tecnico-comercial-microcemento-kaemento.pdf', 'Información técnica y comercial del microcemento.', 'descarga ficha componentes rendimiento cuidados mantenimiento'],
    ['Catálogo comercial de Microcemento KAEMENTO', 'Documento PDF', '/catalogos/catalogo-comercial-microcemento-kaemento-2026.pdf', 'Presentación del sistema de microcemento.', 'descarga kit catalogo'],
    ['Boquilla Mágica', 'Producto', '/productos/boquilla-magica.html', 'Renovación de boquillas y juntas.', 'boquilla magica juntas baldosa enchape blanco beige chocolate negro'],
    ['Roof & Planter System', 'Producto', '/productos/roof-planter-system.html', 'Sistema para cubiertas, terrazas y jardineras.', 'impermeabilizacion techo cubierta jardinera terraza'],
    ['Garage System', 'Producto', '/productos/garage-system.html', 'Sistema para garajes y sótanos.', 'garaje parqueadero sotano piso'],
    ['Facade Protect', 'Producto', '/productos/facade-protect.html', 'Protección de fachadas.', 'fachada fachada protect hidrofugo'],
    ['Micro High Traffic', 'Producto', '/productos/micro-high-traffic.html', 'Sistema para superficies de alto tráfico.', 'microcemento piso industrial trafico'],
    ['Level Protect', 'Producto', '/productos/level-protect.html', 'Preparación y protección de superficies.', 'nivelacion soporte piso'],
    ['Micro Coat', 'Producto', '/productos/micro-coat.html', 'Recubrimiento para superficies arquitectónicas.', 'revestimiento recubrimiento microcemento'],
    ['Todos los productos', 'Productos', '/productos/index.html', 'Explora los sistemas y materiales KAEMENTO.', 'producto materiales catalogo'],
    ['Arquitectura y obras civiles', 'Servicio', '/servicios/proyectos-arquitectonicos-obras-civiles.html', 'Diseño y ejecución de proyectos.', 'arquitectura construccion obra civil remodelacion'],
    ['Mantenimiento de edificaciones', 'Servicio', '/servicios/mantenimiento-edificaciones.html', 'Mantenimiento especializado de inmuebles.', 'edificio mantenimiento reparacion'],
    ['Fachadas e impermeabilización', 'Servicio', '/servicios/fachadas-impermeabilizacion.html', 'Intervención y protección de fachadas y superficies.', 'fachada humedad filtracion cubierta techo impermeabilizar'],
    ['Pisos industriales y alto tráfico', 'Servicio', '/servicios/pisos-alto-trafico.html', 'Soluciones para superficies de uso exigente.', 'piso industrial trafico'],
    ['Garajes y sótanos', 'Servicio', '/servicios/garajes-sotanos.html', 'Intervención de garajes y sótanos.', 'garaje sotano parqueadero'],
    ['Bodegas y centros logísticos', 'Servicio', '/servicios/bodegas-centros-logisticos.html', 'Soluciones para espacios industriales y logísticos.', 'bodega centro logistico industria'],
    ['Todos los servicios', 'Servicios', '/servicios/index.html', 'Encuentra la solución para tu proyecto.', 'servicio aplicacion mantenimiento construccion'],
    ['Trabaja con KAEMENTO', 'Red KAEMENTO', '/red-kaemento.html#aplicadores', 'Registro de aplicadores y profesionales independientes.', 'trabajo empleo aplicador capacitacion contratista microcemento fachadas impermeabilizaciones obras'],
    ['Distribuidores y aliados', 'Red KAEMENTO', '/red-kaemento.html#aliados', 'Ferreterías, distribuidores y puntos de venta especializados.', 'distribuidor aliado ferreteria punto venta comercial tienda'],
    ['Cotiza tu proyecto', 'Contacto', '/index.html#cotizar', 'Cuéntanos qué necesitas para preparar tu solicitud.', 'cotizar cotizacion contacto whatsapp telefono informacion asesor asesoria'],
    ['Cotiza la aplicación de microcemento', 'Contacto', '/productos/microcemento-kaemento.html#cotizar-microcemento', 'Solicita asesoría para tu superficie y proyecto.', 'cotizar cotizacion instalacion aplicador'],
    ['Galería KAEMENTO', 'Galería', '/galeria.html', 'Imágenes, videos y referencias de acabados.', 'galeria fotos imagenes video inspiracion resultados'],
    ['Proyectos KAEMENTO', 'Proyectos', '/proyectos.html', 'Experiencia en proyectos y transformación de espacios.', 'proyecto obra experiencia portafolio'],
    ['Nuestra empresa', 'KAEMENTO', '/empresa.html', 'Conoce KAEMENTO y nuestra experiencia.', 'empresa nosotros quienes somos historia'],
    ['Catálogos y descargas', 'Documentos', '/index.html#catalogos', 'Consulta los documentos de KAEMENTO.', 'catalogo descarga manual documento'],
    ['Catálogo de productos KAEMENTO 2026', 'Documento PDF', '/catalogos/catalogo-productos-kaemento-2026.pdf', 'Portafolio de productos KAEMENTO.', 'descarga materiales sistemas'],
    ['Catálogo de servicios KAEMENTO 2026', 'Documento PDF', '/catalogos/catalogo-servicios-kaemento-2026.pdf', 'Portafolio de servicios KAEMENTO.', 'descarga obras mantenimiento'],
    ['Experiencia KAEMENTO 2026', 'Documento PDF', '/catalogos/experiencia-kaemento-2026.pdf', 'Conoce nuestra experiencia comercial.', 'descarga portafolio empresa proyecto'],
    ['Política de tratamiento de datos', 'Información', '/politica-datos.html', 'Consulta nuestra política de privacidad.', 'privacidad datos personales consentimiento politica'],
  ].map(([title, category, href, description, keywords]) => ({title, category, href, description, keywords}));

  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const aliases = {manuales:'manual', productos:'producto', servicios:'servicio', catalogos:'catalogo', colores:'color', distribuidores:'distribuidor', aliados:'aliado', aplicadores:'aplicador', ferreterias:'ferreteria'};
  const words = value => normalize(value).split(/\s+/).map(word => aliases[word] || word);
  const stopWords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'para', 'y', 'un', 'una', 'con']);
  const indexed = entries.map(entry => ({entry, title:words(entry.title), category:words(entry.category), all:words([entry.title, entry.category, entry.description, entry.keywords].join(' '))}));
  function search(query) {
    const terms = [...new Set(words(String(query || '').slice(0, 120)).filter(word => word && !stopWords.has(word)))];
    if (!terms.length) return [];
    return indexed.map(item => {
      if (!terms.every(term => item.all.some(word => word.startsWith(term)))) return null;
      const score = terms.reduce((total, term) => total + (item.title.includes(term) ? 12 : item.title.some(word => word.startsWith(term)) ? 8 : item.category.includes(term) ? 4 : 1), 0);
      return {entry:item.entry, score};
    }).filter(Boolean).sort((a, b) => b.score - a.score).map(item => item.entry);
  }
  if (typeof module === 'object' && module.exports) { module.exports = {entries, search}; return; }
  const header = document.querySelector('header.nav');
  if (!header || document.getElementById('site-search')) return;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'site-search-trigger';
  trigger.setAttribute('aria-label', 'Buscar en KAEMENTO');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'site-search');
  trigger.title = 'Buscar en KAEMENTO';
  trigger.innerHTML = '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
  header.append(trigger);
  header.classList.add('has-site-search');

  // Deliberately not a form: search must never submit a quote or open WhatsApp.
  const dialog = document.createElement('dialog');
  dialog.id = 'site-search';
  dialog.className = 'site-search-dialog';
  dialog.setAttribute('aria-labelledby', 'site-search-title');
  dialog.innerHTML = `
    <div class="site-search-heading"><span>EXPLORA KAEMENTO</span><button type="button" class="site-search-close" aria-label="Cerrar búsqueda">×</button></div>
    <h2 id="site-search-title">¿Qué estás buscando?</h2>
    <label class="site-search-label" for="site-search-input">Productos, servicios y manuales</label>
    <div class="site-search-field"><input type="search" id="site-search-input" placeholder="Por ejemplo: microcemento" autocomplete="off" spellcheck="false" maxlength="120" enterkeyhint="search" aria-controls="site-search-results" autofocus><button type="button" class="site-search-clear" aria-label="Borrar búsqueda" hidden>×</button></div>
    <div class="site-search-suggestions" aria-label="Búsquedas sugeridas"></div>
    <p class="site-search-status" role="status" aria-live="polite" aria-atomic="true"></p>
    <ul id="site-search-results" class="site-search-results" aria-label="Resultados de búsqueda"></ul>
    <p class="site-search-note">La búsqueda se realiza únicamente en este sitio.</p>`;
  document.body.append(dialog);
  const input = dialog.querySelector('input');
  const list = dialog.querySelector('ul');
  const status = dialog.querySelector('[role="status"]');
  const clear = dialog.querySelector('.site-search-clear');
  const suggestions = dialog.querySelector('.site-search-suggestions');
  for (const text of ['Microcemento', 'Manuales', 'Boquilla Mágica', 'Trabaja con KAEMENTO']) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = text;
    button.addEventListener('click', () => { input.value = text; render(); input.focus(); });
    suggestions.append(button);
  }
  function render() {
    const query = input.value.trim();
    clear.hidden = !query;
    list.replaceChildren();
    if (!query) { status.textContent = 'Elige una sugerencia o escribe para encontrar lo que necesitas.'; return; }
    const results = search(query);
    status.textContent = results.length ? `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}` : 'No encontramos resultados. Prueba con “microcemento”, “manual” o “fachadas”.';
    for (const entry of results) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = entry.href;
      const category = document.createElement('span'); category.className = 'site-search-category'; category.textContent = entry.category;
      const title = document.createElement('strong'); title.textContent = entry.title;
      const description = document.createElement('span'); description.className = 'site-search-description'; description.textContent = entry.description;
      link.append(category, title, description); li.append(link); list.append(li);
      link.addEventListener('click', () => dialog.close());
    }
  }
  function open() {
    if (dialog.open) return;
    const menu = header.querySelector('.menu');
    if (menu?.getAttribute('aria-expanded') === 'true') menu.click();
    render(); dialog.showModal(); document.documentElement.classList.add('site-search-open'); input.focus();
  }
  trigger.addEventListener('click', open);
  dialog.querySelector('.site-search-close').addEventListener('click', () => dialog.close());
  clear.addEventListener('click', () => { input.value = ''; render(); input.focus(); });
  input.addEventListener('input', render);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); list.querySelector('a')?.click(); }
  });
  dialog.addEventListener('keydown', event => {
    // Search inputs can consume Escape to clear themselves; close in one press.
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); dialog.close(); }
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button, input, a[href]')].filter(el => !el.hidden && !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('site-search-open');
    input.value = ''; list.replaceChildren(); status.textContent = ''; trigger.focus({preventScroll:true});
  });
})();
