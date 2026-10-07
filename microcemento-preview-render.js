// Launch swatches with the requested gray display correction; details in docs/color-preview.md.
// Screen interpolation is not a measured physical pigment-mixing model.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./microcemento-preview-scenes.js'));
  else root.KaementoColorPreview = factory(root.KaementoPreviewScenes);
})(typeof window === 'object' ? window : globalThis, scenes => {
  const palette = Object.freeze({
    'extra-blanco': '#e6e1dc', arena: '#bfac9a', 'gris-cemento': '#989694',
    negro: '#2b2b2a', terracota: '#a06145'
  });
  const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
  function colorFor(selection) {
    if (!selection) return null;
    if (selection.colorMode === 'standard') return palette[selection.color] || null;
    const {color1, color2, percentage1, percentage2} = selection;
    if (selection.colorMode !== 'mix' || !palette[color1] || !palette[color2] || color1 === color2 ||
        !Number.isInteger(percentage1) || percentage1 < 10 || percentage1 > 90 || percentage1 % 10 ||
        percentage2 !== 100 - percentage1) return null;
    // Symmetric screen-space interpolation. A physical sample is required for the final shade.
    const a = rgb(palette[color1]), b = rgb(palette[color2]);
    return '#' + a.map((n, i) => Math.round((n * percentage1 + b[i] * percentage2) / 100).toString(16).padStart(2, '0')).join('');
  }
  const clamp = n => Math.max(0, Math.min(1, n));
  function materialField(luminance, alpha, width, height, reference) {
    // Amplify the photograph's own mineral grain and trowel variation, without adding noise.
    // Mask-weighted averages keep furniture and fittings out of the texture calculation.
    const stride = width + 1, size = stride * (height + 1);
    const sums = new Float64Array(size), weights = new Float64Array(size);
    for (let y = 0; y < height; y++) {
      let rowSum = 0, rowWeight = 0;
      for (let x = 0; x < width; x++) {
        const i = y * width + x, p = (y + 1) * stride + x + 1;
        rowSum += luminance[i] * alpha[i]; rowWeight += alpha[i];
        sums[p] = sums[p - stride] + rowSum; weights[p] = weights[p - stride] + rowWeight;
      }
    }
    function average(x, y, radius, fallback) {
      const x0 = Math.max(0, x - radius), x1 = Math.min(width, x + radius + 1);
      const y0 = Math.max(0, y - radius), y1 = Math.min(height, y + radius + 1);
      const a = y0 * stride + x0, b = y0 * stride + x1, c = y1 * stride + x0, d = y1 * stride + x1;
      const weight = weights[d] - weights[b] - weights[c] + weights[a];
      return weight > .01 ? (sums[d] - sums[b] - sums[c] + sums[a]) / weight : fallback;
    }
    const relief = new Float32Array(width * height), enhanced = new Float32Array(luminance), softEnhanced = new Float32Array(luminance);
    const histogram = new Uint32Array(32768), softHistogram = new Uint32Array(32768);
    let sampleCount = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!alpha[i]) continue;
      const value = luminance[i], body = value - average(x, y, 38, value);
      const grain = value - average(x, y, 3, value);
      // Protect strong light/shadow edges from becoming hard outlines.
      const guard = 1 - clamp((Math.abs(body) - .035) / .09);
      relief[i] = Math.max(-.045, Math.min(.045, body * 1.15 + grain * .4)) * guard;
      enhanced[i] = Math.max(.001, Math.min(.999, value + relief[i]));
      softEnhanced[i] = Math.max(.001, Math.min(.999, value + relief[i] * .8));
      if (alpha[i] > .99 && x >= reference[0] && x < reference[2] && y >= reference[1] && y < reference[3]) {
        histogram[Math.round(enhanced[i] * 32767)]++; sampleCount++;
        softHistogram[Math.round(softEnhanced[i] * 32767)]++;
      }
    }
    function medianOf(bins) {
      let cumulative = 0;
      if (sampleCount) for (let i = 0; i < bins.length; i++) {
        cumulative += bins[i];
        if (cumulative >= sampleCount / 2) return i / 32767;
      }
      return .5;
    }
    return {enhanced, relief, median:medianOf(histogram), softEnhanced, softMedian:medianOf(softHistogram)};
  }
  function createRenderer(image, canvas, onUnavailable, sceneId = 'sala', onReady = () => {}) {
    const scene = scenes[sceneId] || scenes.sala;
    let source, output, masks, context, frame, disposed = false;
    let colors = {walls: null, floor: null}, finishes = {walls: null, floor: null};
    const width = 1536, height = 1024;
    const inside = (x,y,rect) => x >= rect[0] && y >= rect[1] && x < rect[2] && y < rect[3];
    function detailAlpha(x,y,luminance,p,surface) {
      let alpha = 1;
      for (const detail of scene.details) {
        if ((detail.surface && detail.surface !== surface) || !inside(x,y,detail.rect) || (detail.except && inside(x,y,detail.except))) continue;
        if (detail.dark) alpha *= clamp((luminance-detail.dark[0])/detail.dark[1]);
        if (detail.green) {
          const greenness=(source.data[p+1]-source.data[p+2])-.5*(source.data[p]-source.data[p+1]);
          alpha *= 1-clamp((greenness-detail.green[0])/detail.green[1]);
        }
        if (detail.warm) {
          const warmth=(source.data[p]-source.data[p+2])/Math.max(1,source.data[p]);
          alpha *= clamp((detail.warm[0]-warmth)/detail.warm[1]);
        }
      }
      return alpha;
    }
    function reflection(x,y,surface) {
      // Illustrative soft window reflection, not a measured gloss/BRDF model.
      const nx=x/width, ny=y/height;
      const center=scene.light+(ny-.6)*(scene.light>.5?-.15:.15);
      const spread=surface==='floor'?.18:.26;
      return (surface==='floor'?.34:.20)*Math.exp(-2*((nx-center)/spread)**2)*
        Math.exp(-(((ny-(surface==='floor'?.88:.3))/(surface==='floor'?.5:.6))**2));
    }
    function mask(path, holes = [], openings = []) {
      const layer = document.createElement('canvas');
      layer.width = width; layer.height = height;
      const ctx = layer.getContext('2d', {willReadFrequently: true});
      ctx.fillStyle = '#fff'; ctx.fill(new Path2D(path));
      ctx.globalCompositeOperation = 'destination-out';
      holes.forEach(p => ctx.fill(new Path2D(p)));
      ctx.globalCompositeOperation = 'source-over';
      openings.forEach(p => ctx.fill(new Path2D(p)));
      return ctx.getImageData(0, 0, width, height).data;
    }
    function prepare() {
      if (disposed || source || !image.naturalWidth) return;
      if (image.currentSrc && new URL(image.currentSrc).pathname !== scene.src) return;
      try {
        canvas.width = width; canvas.height = height;
        context = canvas.getContext('2d', {willReadFrequently: true});
        context.drawImage(image, 0, 0, width, height);
        source = context.getImageData(0, 0, width, height);
        output = context.createImageData(width, height);
        const walls = mask(scene.wall, scene.wallHoles);
        const floor = mask(scene.floor, scene.floorHoles);
        const luminances = new Float32Array(width * height);
        const wallAlpha = new Float32Array(width * height), floorAlpha = new Float32Array(width * height);
        for (let i = 0; i < luminances.length; i++) {
          const p = i * 4, x = i % width, y = Math.floor(i / width);
          const luminance = (.2126 * source.data[p] + .7152 * source.data[p + 1] + .0722 * source.data[p + 2]) / 255;
          luminances[i] = luminance;
          wallAlpha[i] = walls[p + 3] / 255 * detailAlpha(x,y,luminance,p,'walls');
          floorAlpha[i] = floor[p + 3] / 255 * detailAlpha(x,y,luminance,p,'floor');
        }
        const wallMaterial = materialField(luminances, wallAlpha, width, height, scene.reference.walls);
        const floorMaterial = materialField(luminances, floorAlpha, width, height, scene.reference.floor);
        const count = data => { let n = 0; for (let p = 3; p < data.length; p += 4) if (data[p]) n++; return n; };
        masks = {walls: new Float32Array(count(walls) * 6), floor: new Float32Array(count(floor) * 6)};
        let wallIndex = 0, floorIndex = 0;
        for (let p = 0; p < source.data.length; p += 4) {
          const x = (p / 4) % width, y = Math.floor(p / 4 / width);
          const i = p / 4;
          if (wallAlpha[i]) {
            masks.walls[wallIndex++] = p; masks.walls[wallIndex++] = wallAlpha[i];
            masks.walls[wallIndex++] = wallMaterial.enhanced[i] / wallMaterial.median;
            masks.walls[wallIndex++] = reflection(x,y,'walls') * (1 + wallMaterial.relief[i] * 4);
            masks.walls[wallIndex++] = wallMaterial.softEnhanced[i] / wallMaterial.softMedian;
            masks.walls[wallIndex++] = reflection(x,y,'walls') * (1 + wallMaterial.relief[i] * .8 * 4);
          }
          if (floorAlpha[i]) {
            masks.floor[floorIndex++] = p; masks.floor[floorIndex++] = floorAlpha[i];
            masks.floor[floorIndex++] = floorMaterial.enhanced[i] / floorMaterial.median;
            masks.floor[floorIndex++] = reflection(x,y,'floor') * (1 + floorMaterial.relief[i] * 4);
            masks.floor[floorIndex++] = floorMaterial.softEnhanced[i] / floorMaterial.softMedian;
            masks.floor[floorIndex++] = reflection(x,y,'floor') * (1 + floorMaterial.relief[i] * .8 * 4);
          }
        }
        masks.walls = masks.walls.subarray(0, wallIndex);
        masks.floor = masks.floor.subarray(0, floorIndex);
        draw();
        onReady();
      } catch (_) {
        source = null; canvas.hidden = true; onUnavailable();
      }
    }
    function draw() {
      if (!source || disposed) return;
      output.data.set(source.data);
      for (const surface of ['walls', 'floor']) {
        if (!colors[surface]) continue;
        const target = rgb(colors[surface]);
        const mask = masks[surface];
        // Cement Gray and glossy finishes retain the approved mineral detail.
        // Only other matte tones soften the added texture.
        const profile = colors[surface] === palette['gris-cemento'] || finishes[surface] === 'brillante' ? 2 : 4;
        for (let i = 0; i < mask.length; i += 6) {
          const p = mask[i], alpha = mask[i + 1], shade = mask[i + profile];
          for (let c = 0; c < 3; c++) {
            let value = Math.min(255, target[c] * shade);
            if (finishes[surface] === 'brillante') value += (Math.max(value,246)-value)*mask[i+profile+1];
            output.data[p + c] = source.data[p + c] * (1 - alpha) + value * alpha;
          }
        }
      }
      context.putImageData(output, 0, 0);
      canvas.hidden = !colors.walls && !colors.floor;
    }
    const unavailable = () => { if (!disposed) onUnavailable(); };
    image.addEventListener('load', prepare);
    image.addEventListener('error', unavailable);
    if (image.complete && image.naturalWidth) prepare();
    return {
      update(next, nextFinishes = {}) {
        if (next.walls === colors.walls && next.floor === colors.floor && nextFinishes.walls === finishes.walls && nextFinishes.floor === finishes.floor) return;
        colors = next;
        finishes = nextFinishes;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      },
      dispose() {
        disposed = true; cancelAnimationFrame(frame);
        image.removeEventListener('load', prepare);
        image.removeEventListener('error', unavailable);
        source = output = masks = null;
      }
    };
  }
  return {palette, scenes, colorFor, materialField, createRenderer};
});
