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
    let selections = {walls: empty(), floor: empty()}, applied = {walls:null, floor:null}, active = 'floor', writing = false;
    const section = document.createElement('section');
    section.className = 'kae-color-preview'; section.dataset.colorPreview = '';
    section.id = 'vista-colores-microcemento' + (index ? '-' + index : '');
    section.setAttribute('aria-labelledby', 'kae-preview-title-' + index);
    section.innerHTML = `<h4 id="kae-preview-title-${index}">Tu tonalidad, en cada espacio.</h4>
      <p class="kae-preview-intro">Cambia de ambiente y prueba tu tonalidad en piso y muros.</p>
      <div class="kae-preview-surfaces" role="group" aria-label="Superficie que estás configurando">
        <button type="button" data-preview-surface="floor" aria-pressed="true"><strong><span class="kae-preview-chip" aria-hidden="true"></span>Piso</strong><span class="kae-preview-recipe-label">Tu selección</span><small data-preview-summary>Sin seleccionar</small><span class="kae-preview-order-state" hidden>En carrito</span><span class="kae-preview-finish" hidden></span></button>
        <button type="button" data-preview-surface="walls" aria-pressed="false"><strong><span class="kae-preview-chip" aria-hidden="true"></span>Muros</strong><span class="kae-preview-recipe-label">Tu selección</span><small data-preview-summary>Sin seleccionar</small><span class="kae-preview-order-state" hidden>En carrito</span><span class="kae-preview-finish" hidden></span></button>
      </div>
      <label class="kae-preview-room">Cambia de ambiente · 6 espacios<select data-preview-scene>${Object.entries(preview.scenes).map(([id,scene])=>'<option value="'+id+'">'+scene.label+'</option>').join('')}</select></label>
      <figure><div class="kae-preview-scene"><img src="/assets/microcemento/visualizador/sala-base.webp" width="1536" height="1024" loading="lazy" decoding="async" alt="Ambiente ilustrativo con pared principal y piso de microcemento, sofá claro y muebles de madera."><canvas aria-hidden="true" hidden></canvas></div>
      <figcaption>Simulación de color y acabado. Valida una muestra física: el resultado depende de la mezcla, la aplicación, la luz y la pantalla.</figcaption></figure>
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
    const image = section.querySelector('img');
    const buttons = [...section.querySelectorAll('[data-preview-surface]')];
    const status = section.querySelector('.kae-preview-editing');
    const sceneControl = section.querySelector('[data-preview-scene]'), frame = section.querySelector('.kae-preview-scene');
    const caption = section.querySelector('figcaption'), captionText = caption.textContent;
    // Keep tone controls beside the complete photograph on desktop, below it on mobile.
    const workspace = document.createElement('div'); workspace.className = 'kae-preview-workspace';
    const figure = section.querySelector('figure');
    figure.before(workspace); workspace.append(figure, controls);
    controls.prepend(status);
    controls.addEventListener('focusin', event => {
      if (!window.matchMedia('(max-width:719px)').matches || getComputedStyle(figure).position !== 'sticky' || !event.target.matches('input,select,button')) return;
      requestAnimationFrame(() => {
        const bottom = figure.getBoundingClientRect().bottom, top = event.target.getBoundingClientRect().top;
        if (top < bottom + 12) window.scrollBy({top:top-bottom-12,behavior:'instant'});
      });
    });
    let renderer, activeScene = 'sala';
    function loadScene(id) {
      if (!preview.scenes[id]) return;
      renderer?.dispose(); activeScene = id; section.dataset.scene = id;
      section.querySelector('canvas').hidden = true; frame.setAttribute('aria-busy','true');
      image.src = preview.scenes[id].src;
      renderer = preview.createRenderer(image, section.querySelector('canvas'), () => {
        frame.setAttribute('aria-busy','false');
        caption.textContent = 'No se pudo mostrar la simulación. Puedes elegir otro espacio o continuar configurando tu pedido. Valida el tono con una muestra física.';
      }, id, () => {frame.setAttribute('aria-busy','false');caption.textContent=captionText;});
      paint();
    }
    sceneControl.addEventListener('change', () => loadScene(sceneControl.value));
    const read = () => Object.fromEntries(names.map(name => [name, fields[name].value]));
    let seen = false, started = false;
    new IntersectionObserver(entries => {if (entries.some(e => e.isIntersecting)) seen = true;}).observe(section);
    for (const name of ['color','tone1','tone2','ratio']) fields[name].addEventListener('change', event => {
      if (event.isTrusted && seen && !started && selection(read())) {
        started = true;
        window.kaementoTrack?.('microcemento_simulator_start',{button_id:'color-preview'});
      }
    });
    function selection(values) {
      const shared = {productId:'microcemento-kaemento-launch',quantity:1,sealer:values.sealer || 'mate',colorMode:values.mode};
      return config.normalize(values.mode === 'standard' ? {...shared, color:values.color} : {
        ...shared, color1:values.tone1, color2:values.tone2, percentage1:Number(values.ratio), percentage2:100-Number(values.ratio)
      });
    }
    function paint() {
      panel.dataset.kitSurface = active;
      const colors = {}, descriptions = {}, finishes = {};
      for (const button of buttons) {
        const surface = button.dataset.previewSurface, draft = selection(selections[surface]), chosen = draft || applied[surface];
        colors[surface] = preview.colorFor(chosen);
        finishes[surface] = draft ? selections[surface].sealer : applied[surface]?.sealer;
        descriptions[surface] = chosen ? config.formula(chosen) : 'Sin seleccionar';
        button.setAttribute('aria-pressed', String(surface === active));
        const summary = button.querySelector('[data-preview-summary]');
        button.querySelector('.kae-preview-recipe-label').textContent = chosen?.colorMode === 'mix' ? 'Tu mezcla' : chosen ? 'Tu tono' : 'Tu selección';
        const parts = !chosen ? ['Sin seleccionar'] : chosen.colorMode === 'standard' ? [config.colors.get(chosen.color) + ' 100%'] : [
          config.colors.get(chosen.color1) + ' ' + chosen.percentage1 + '%',
          '+ ' + config.colors.get(chosen.color2) + ' ' + chosen.percentage2 + '%'
        ];
        summary.replaceChildren(...parts.map((text,index) => {
          const line = document.createElement('span'); line.textContent = (index ? ' ' : '') + text; return line;
        }));
        button.querySelector('.kae-preview-order-state').hidden = !!draft || !applied[surface];
        const finish = button.querySelector('.kae-preview-finish');
        finish.hidden = !chosen;
        finish.textContent = finishes[surface] ? 'Sellador: ' + (finishes[surface] === 'brillante' ? 'Brillante' : 'Mate') : 'Sellador por elegir';
        button.querySelector('.kae-preview-chip').style.setProperty('--preview-color', colors[surface] || '#e0dcd4');
      }
      image.alt = preview.scenes[activeScene].alt + '. Simulación de microcemento. Pared principal: ' + descriptions.walls + '. Piso: ' + descriptions.floor + '. Mobiliario sin cambios.';
      renderer?.update(colors, finishes);
      const busy = buy.getAttribute('aria-busy') === 'true', editing = !cancel.hidden;
      for (const control of buttons) control.disabled = busy || editing;
      status.textContent = editing ? 'Estás editando una configuración del carrito. Guarda o cancela para cambiar de superficie.' :
        'Configurando: ' + (active === 'walls' ? 'muros' : 'piso') + '. Solo cambia esta superficie. Elige el sellador y los kits; después añade tu selección al carrito.';
    }
    function sync() {
      if (writing) return;
      selections[active] = read();
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
    panel.addEventListener('kaemento:configuration-editing',event => {
      active = event.detail.surface === 'walls' ? 'walls' : 'floor';
      paint();
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
      selections = {walls:empty(), floor:empty()}; applied = {walls:null, floor:null}; active = 'floor'; paint();
    }
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
    loadScene('sala'); sync();
    if (window.location.hash === '#' + section.id) requestAnimationFrame(() => section.scrollIntoView({block:'start',behavior:'instant'}));
  });
})();
