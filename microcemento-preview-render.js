// Medians from the approved launch swatches; sampling coordinates are in docs/color-preview.md.
// Screen interpolation is not a measured physical pigment-mixing model.
((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KaementoColorPreview = factory();
})(typeof window === 'object' ? window : globalThis, () => {
  const palette = Object.freeze({
    'extra-blanco': '#e6e1dc', arena: '#bfac9a', 'gris-cemento': '#787674',
    negro: '#2b2b2a', terracota: '#a06145'
  });
  // Median brightness of unobstructed reference areas in sala-base.webp.
  // Preserve relative lighting while matching the swatch in the reference-lit area.
  const referenceBrightness = {walls: .6122007843137255, floor: .6884298039215687};
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
  function createRenderer(image, canvas, onUnavailable) {
    let source, output, masks, context, frame, disposed = false;
    let colors = {walls: null, floor: null};
    const width = 1536, height = 1024;
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
      try {
        canvas.width = width; canvas.height = height;
        context = canvas.getContext('2d', {willReadFrequently: true});
        context.drawImage(image, 0, 0, width, height);
        source = context.getImageData(0, 0, width, height);
        output = context.createImageData(width, height);
        // Geometry belongs to sala-base.webp: keep the architecture and every foreground object fixed.
        const walls = mask('M311 40L1073 42V429L1055 430L1056 397L1016 391L995 388L986 383L919 384L908 380L836 383L805 381L757 384L682 382L621 385L582 383L515 389L477 401L467 411L448 428L440 432V522L331 519V446H311Z', [
          'M358 459Q391 454 430 459V514L413 520L408 539H369L364 515L359 507Z'
        ]);
        const floor = mask('M0 592L239 516L440 522L1079 522L1081 436L1108 437V453L1153 467L1155 480L1180 485V491L1222 501L1536 633V1024H0Z', [
          'M190 511L208 503L311 498L335 507L356 523L352 537L208 562L190 550Z',
          'M537 496Q660 479 788 498L809 505L809 515L764 528L763 583Q746 591 659 588Q641 600 618 592L617 578Q590 584 572 576L570 525L537 518Z',
          'M458 520H465V544H458Z M1075 520H1081V547H1075Z M360 514H430V524L409 540H369Z'
        ]);
        const count = data => { let n = 0; for (let p = 3; p < data.length; p += 4) if (data[p]) n++; return n; };
        masks = {walls: new Float32Array(count(walls) * 3), floor: new Float32Array(count(floor) * 3)};
        let wallIndex = 0, floorIndex = 0;
        for (let p = 0; p < source.data.length; p += 4) {
          const x = (p / 4) % width, y = Math.floor(p / 4 / width);
          const luminance = (.2126 * source.data[p] + .7152 * source.data[p + 1] + .0722 * source.data[p + 2]) / 255;
          let wallAlpha = walls[p + 3] / 255;
          let floorAlpha = floor[p + 3] / 255;
          // Preserve fine foliage and the dark lamp within these bounded foreground regions.
          if ((x < 416 && y > 210 && y < 446) || (x > 432 && x < 501 && y > 268 && y < 524)) {
            wallAlpha *= clamp((luminance - .42) / .12);
          }
          // The chair's wood is warmer than the floor; preserve its silhouette and fine legs.
          if (x > 64 && x < 375 && y > 495 && y < 647 && !(y > 610 && x > 175)) {
            const warmth = (source.data[p] - source.data[p + 2]) / Math.max(1, source.data[p]);
            floorAlpha *= clamp((.22 - warmth) / .035);
          }
          if (wallAlpha) { masks.walls[wallIndex++] = p; masks.walls[wallIndex++] = wallAlpha; masks.walls[wallIndex++] = luminance / referenceBrightness.walls; }
          if (floorAlpha) { masks.floor[floorIndex++] = p; masks.floor[floorIndex++] = floorAlpha; masks.floor[floorIndex++] = luminance / referenceBrightness.floor; }
        }
        masks.walls = masks.walls.subarray(0, wallIndex);
        masks.floor = masks.floor.subarray(0, floorIndex);
        draw();
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
        for (let i = 0; i < mask.length; i += 3) {
          const p = mask[i], alpha = mask[i + 1], shade = mask[i + 2];
          for (let c = 0; c < 3; c++) {
            output.data[p + c] = source.data[p + c] * (1 - alpha) + Math.min(255, target[c] * shade) * alpha;
          }
        }
      }
      context.putImageData(output, 0, 0);
      canvas.hidden = !colors.walls && !colors.floor;
    }
    image.addEventListener('load', prepare);
    image.addEventListener('error', onUnavailable);
    if (image.complete && image.naturalWidth) prepare();
    return {
      update(next) {
        if (next.walls === colors.walls && next.floor === colors.floor) return;
        colors = next;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
      },
      dispose() {
        disposed = true; cancelAnimationFrame(frame);
        image.removeEventListener('load', prepare);
        image.removeEventListener('error', onUnavailable);
        source = output = masks = null;
      }
    };
  }
  return {palette, colorFor, createRenderer};
});
