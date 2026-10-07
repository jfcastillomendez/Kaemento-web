(() => {
  const config = window.KaementoBoldConfig, preview = window.KaementoColorPreview;
  if (!config || !preview) return;
  document.querySelectorAll('[data-bold-purchase]').forEach((panel, index) => {
    if (panel.querySelector('[data-color-preview]')) return;
    const names = ['mode', 'color', 'tone1', 'tone2', 'ratio', 'sealer', 'quantity'];
    const fields = Object.fromEntries(names.map(name => [name, panel.querySelector('[data-bold-' + name + ']')]));
    const formula = panel.querySelector('[data-bold-formula]');
    const buy = panel.querySelector('[data-bold-buy]'), cancel = panel.querySelector('[data-cart-cancel]');
    if (!formula || !buy || !cancel || Object.values(fields).some(field => !field)) return;
    const empty = () => Object.fromEntries(names.map(name => [name, '']));
    let selections = {walls: empty(), floor: empty()}, applied = {walls:null, floor:null}, active = 'walls', writing = false;
    const section = document.createElement('section');
    section.className = 'kae-color-preview'; section.dataset.colorPreview = '';
    section.id = 'vista-colores-microcemento' + (index ? '-' + index : '');
    section.setAttribute('aria-labelledby', 'kae-preview-title-' + index);
    section.innerHTML = `<h4 id="kae-preview-title-${index}">Imagina la combinación en tu espacio.</h4>
      <p class="kae-preview-intro">Elige paredes o piso y prueba colores o mezclas. Cada superficie conserva su selección.</p>
      <figure><div class="kae-preview-scene"><img src="/assets/microcemento/visualizador/sala-base.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="Ambiente ilustrativo con pared principal y piso de microcemento, sofá claro y muebles de madera."><canvas aria-hidden="true" hidden></canvas></div>
      <figcaption>Visualización conceptual · Color orientativo. Valida una muestra física: el resultado depende de la mezcla, la aplicación, la luz y la pantalla.</figcaption></figure>
      <div class="kae-preview-surfaces" role="group" aria-label="Superficie que estás configurando">
        <button type="button" data-preview-surface="walls" aria-pressed="true"><strong><span class="kae-preview-chip" aria-hidden="true"></span>Paredes</strong><span class="kae-preview-recipe-label">Tu selección</span><small data-preview-summary>Sin seleccionar</small><span class="kae-preview-order-state" hidden>En carrito</span></button>
        <button type="button" data-preview-surface="floor" aria-pressed="false"><strong><span class="kae-preview-chip" aria-hidden="true"></span>Piso</strong><span class="kae-preview-recipe-label">Tu selección</span><small data-preview-summary>Sin seleccionar</small><span class="kae-preview-order-state" hidden>En carrito</span></button>
      </div>
      <label class="kae-preview-link"><input type="checkbox" data-preview-linked><span>Usar el mismo tono en ambos</span></label>
      <p class="kae-preview-editing" role="status" aria-live="polite"></p>`;
    const layout = document.createElement('div'), controls = document.createElement('div');
    layout.className = 'kae-configurator-layout'; controls.className = 'kae-preview-controls';
    const existing = [...panel.querySelectorAll('.kae-purchase-variants, .kae-purchase-formula, .kae-purchase-controls')];
    existing[0].before(layout); controls.append(...existing); layout.append(section, controls);
    const jump = document.createElement('button');
    jump.type = 'button'; jump.className = 'kae-preview-jump'; jump.textContent = 'Ver combinación ↑';
    formula.after(jump);
    jump.addEventListener('click', () => {
      section.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      section.querySelector('[data-preview-surface="'+active+'"]').focus({preventScroll:true});
    });
    const image = section.querySelector('img'), linked = section.querySelector('[data-preview-linked]');
    const buttons = [...section.querySelectorAll('[data-preview-surface]')];
    const status = section.querySelector('.kae-preview-editing');
    const renderer = preview.createRenderer(image, section.querySelector('canvas'), () => {
      section.querySelector('figcaption').textContent = 'La vista de color no está disponible en este navegador. Puedes continuar eligiendo tu fórmula y comprando. Valida siempre el tono con una muestra física.';
    });
    const read = () => Object.fromEntries(names.map(name => [name, fields[name].value]));
    function selection(values) {
      const shared = {productId:'microcemento-kaemento-launch',quantity:1,sealer:'mate',colorMode:values.mode};
      return config.normalize(values.mode === 'standard' ? {...shared, color:values.color} : {
        ...shared, color1:values.tone1, color2:values.tone2, percentage1:Number(values.ratio), percentage2:100-Number(values.ratio)
      });
    }
    function paint() {
      const colors = {}, descriptions = {};
      for (const button of buttons) {
        const surface = button.dataset.previewSurface, draft = selection(selections[surface]), chosen = draft || applied[surface];
        colors[surface] = preview.colorFor(chosen);
        descriptions[surface] = chosen ? config.formula(chosen) : 'Sin seleccionar';
        button.setAttribute('aria-pressed', String(surface === active));
        const summary = button.querySelector('[data-preview-summary]');
        button.querySelector('.kae-preview-recipe-label').textContent = chosen?.colorMode === 'mix' ? 'Tu mezcla' : chosen ? 'Tu tono' : 'Tu selección';
        const parts = !chosen ? ['Sin seleccionar'] : chosen.colorMode === 'standard' ? [config.colors.get(chosen.color) + ' 100%'] : [
          config.colors.get(chosen.color1) + ' ' + chosen.percentage1 + '%',
          '+ ' + config.colors.get(chosen.color2) + ' ' + chosen.percentage2 + '%'
        ];
        summary.replaceChildren(...parts.map(text => {
          const line = document.createElement('span'); line.textContent = text; return line;
        }));
        button.querySelector('.kae-preview-order-state').hidden = !!draft || !applied[surface];
        button.querySelector('.kae-preview-chip').style.setProperty('--preview-color', colors[surface] || '#e0dcd4');
      }
      image.alt = 'Simulación de microcemento. Pared principal: ' + descriptions.walls + '. Piso: ' + descriptions.floor + '. Mobiliario sin cambios.';
      renderer.update(colors);
      const busy = buy.getAttribute('aria-busy') === 'true', editing = !cancel.hidden;
      for (const control of [...buttons, linked]) control.disabled = busy || editing;
      status.textContent = editing ? 'Estás editando una configuración del carrito. Guarda o cancela para cambiar de superficie.' :
        'Configurando: ' + (active === 'walls' ? 'paredes' : 'piso') + '. Elige el sellador y los kits para esta configuración; después añádela al carrito.';
    }
    function sync() {
      if (writing) return;
      selections[active] = read();
      if (linked.checked) {
        const other = active === 'walls' ? 'floor' : 'walls';
        for (const name of ['mode','color','tone1','tone2','ratio']) selections[other][name] = selections[active][name];
      }
      paint();
    }
    function write(values) {
      writing = true;
      for (const name of names) { fields[name].value = values[name]; fields[name].setCustomValidity(''); }
      // Reuse the existing form's validation, price calculation and add-to-cart pathway.
      fields.mode.dispatchEvent(new Event('change', {bubbles:true}));
      fields.quantity.dispatchEvent(new Event('input', {bubbles:true}));
      writing = false;
      paint();
    }
    for (const button of buttons) button.addEventListener('click', () => {
      if (button.disabled || button.dataset.previewSurface === active) return;
      sync(); active = button.dataset.previewSurface; write(selections[active]);
    });
    linked.addEventListener('change', () => {
      if (linked.checked && !selection(read()) && applied[active]) {
        const item = applied[active];
        selections[active] = {...read(),mode:item.colorMode,color:item.color || '',tone1:item.color1 || '',tone2:item.color2 || '',ratio:String(item.percentage1 || '')};
        write(selections[active]);
      }
      sync();
    });
    panel.addEventListener('kaemento:configuration-added', event => {
      applied[active] = {...event.detail};
      sync();
    });
    panel.addEventListener('kaemento:cart-updated', event => {
      for (const surface of ['walls','floor']) {
        if (applied[surface] && !event.detail.items.some(item => config.lineKey(item) === config.lineKey(applied[surface]))) applied[surface] = null;
      }
      paint();
    });
    for (const field of Object.values(fields)) {
      field.addEventListener('change', sync);
      if (field === fields.quantity) field.addEventListener('input', sync);
    }
    // The existing cart also restores and clears controls programmatically. Observe its rendered formula.
    const observer = new MutationObserver(sync);
    observer.observe(formula, {childList:true, characterData:true, subtree:true});
    observer.observe(cancel, {attributes:true, attributeFilter:['hidden']});
    observer.observe(buy, {attributes:true, attributeFilter:['aria-busy']});
    function clear() {
      selections = {walls:empty(), floor:empty()}; applied = {walls:null, floor:null}; active = 'walls'; linked.checked = false; paint();
    }
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
    sync();
    if (window.location.hash === '#' + section.id) requestAnimationFrame(() => section.scrollIntoView({block:'start',behavior:'instant'}));
  });
})();
